import duckdb, { DuckDBInstance } from '@duckdb/node-api';
import { MarkdownGenerator } from 'toak';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createYoga, createSchema } from 'graphql-yoga';
import { createServer } from 'http';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

export async function startServer() {
    const instance = await DuckDBInstance.create(':memory:');
    let tempFilePath: string | null = null;

    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

    type PlanStep = {
        id: string;
        description: string;
        status: 'pending' | 'in_progress' | 'completed' | 'failed';
        output?: string;
    };

    type AgentSession = {
        id: string;
        goal: string;
        createdAt: number;
        steps: PlanStep[];
        status: 'idle' | 'running' | 'completed' | 'failed';
    };

    const sessions = new Map<string, AgentSession>();

    type ProjectSession = {
        id: string;
        name: string;
        language: string;
        framework?: string | null;
        spec: string;
        targetDir: string;
        createdAt: number;
        steps: PlanStep[];
        status: 'running' | 'completed' | 'failed';
    };

    const projectSessions = new Map<string, ProjectSession>();

    function safeResolvePath(relativePath: string) {
        const full = resolve(repoRoot, relativePath);
        if (!full.startsWith(repoRoot)) {
            throw new Error('Path traversal detected');
        }
        return full;
    }

    // Function to update repository data
    async function updateRepoData() {
        const generator = new MarkdownGenerator({
            dir: "../../",
            verbose: true,
        });

        const repoChunks = await generator.splitByTokens(256);

        // Debug: log the first chunk to see structure
        console.log('First chunk structure:', JSON.stringify(repoChunks[0], null, 2));

        const repoJson = JSON.stringify(repoChunks);

        // Clean up old temp file
        if (tempFilePath) {
            try {
                unlinkSync(tempFilePath);
            } catch (error) {
                console.warn('Failed to clean up old temp file:', error);
            }
        }

        // Create new temp file
        tempFilePath = join(tmpdir(), `repo-chunks-${Date.now()}.json`);
        writeFileSync(tempFilePath, repoJson, 'utf-8');

        // Update DuckDB view
        const connection = await instance.connect();
        try {
            await connection.run(`
                CREATE OR REPLACE VIEW repo AS
                SELECT * FROM read_json('${tempFilePath}');
            `);
            console.log('Repository data updated');
        } finally {
            connection.closeSync();
        }
    }

    // Initial data load
    await updateRepoData();

    // Update data every 30 seconds
    const updateInterval = setInterval(async () => {
        try {
            await updateRepoData();
        } catch (error) {
            console.error('Error updating repository data:', error);
        }
    }, 30000);

    // Define GraphQL schema
    const schema = createSchema({
        typeDefs: /* GraphQL */ `
            type FileChunk {
                fileName: String!
                content: String!
                tokens: Int!
                chunkIndex: Int
            }

            type FileStats {
                fileName: String!
                totalChunks: Int!
                totalTokens: Int!
                avgTokensPerChunk: Float!
            }

            type PlanStep {
                id: ID!
                description: String!
                status: String!
                output: String
            }

            type AgentSession {
                id: ID!
                goal: String!
                createdAt: Float!
                status: String!
                steps: [PlanStep!]!
            }

            type ProjectSession {
                id: ID!
                name: String!
                language: String!
                framework: String
                spec: String!
                targetDir: String!
                createdAt: Float!
                status: String!
                steps: [PlanStep!]!
            }

            type BuildResult {
                success: Boolean!
                logs: String!
            }

            type PackageInfo {
                name: String!
                dir: String!
                hasBuild: Boolean!
            }

            type Query {
                # Debug: Get raw data structure
                debugSchema: String!

                # Get all file chunks
                chunks(limit: Int = 100, offset: Int = 0): [FileChunk!]!

                # Search chunks by content
                searchContent(query: String!, limit: Int = 20): [FileChunk!]!

                # Get chunks for a specific file
                fileChunks(fileName: String!): [FileChunk!]!

                # Get file statistics
                fileStats(fileName: String): [FileStats!]!

                # Get largest chunks
                largestChunks(limit: Int = 10): [FileChunk!]!

                # Get all unique file names
                fileNames: [String!]!

                # Read a file's content by path (relative to repo root)
                readFile(path: String!): String!

                # List package directories under ./packages
                listPackages: [String!]!

                # Detailed package info
                packages: [PackageInfo!]!

                # Detect package manager at repo root
                detectPackageManager: String!

                # Get agent session by id
                agentSession(id: ID!): AgentSession

                # Get project build session by id
                projectSession(id: ID!): ProjectSession
            }

            type Mutation {
                # Write or create a file at path (relative to repo root)
                writeFile(path: String!, content: String!): Boolean!

                # Start an autonomous agent run to build the repo
                startAgent(goal: String!): AgentSession!

                # Build all packages (best-effort)
                buildAllPackages: BuildResult!

                # Install dependencies at root using detected manager
                installDependencies: BuildResult!

                # Build workspace in topological order
                buildWorkspace: BuildResult!

                # Build a specific package by name
                buildPackage(name: String!): BuildResult!

                # Start a project build from high-level spec
                startProjectBuild(name: String!, language: String!, framework: String, spec: String!, runInstall: Boolean = true, runBuild: Boolean = false): ProjectSession!

                # Convenience: parse a natural-language prompt and build
                buildFromPrompt(prompt: String!): ProjectSession!
            }
        `,
        resolvers: {
            Query: {
                debugSchema: async () => {
                    const connection = await instance.connect();
                    try {
                        const result = await connection.run(`
                            DESCRIBE repo
                        `);
                        const rows = await result.getRows();
                        return JSON.stringify(rows, null, 2);
                    } finally {
                        connection.closeSync();
                    }
                },

                chunks: async (_parent, args) => {
                    const connection = await instance.connect();
                    try {
                        const result = await connection.run(`
                            SELECT fileName, content, meta.tokens as tokens, meta.chunkIndex as chunkIndex
                            FROM repo
                            LIMIT ${args.limit}
                            OFFSET ${args.offset}
                        `);
                        return (await result.getRows()).map((row: any) => ({
                            fileName: row[0],
                            content: row[1],
                            tokens: Number(row[2]),
                            chunkIndex: Number(row[3])
                        }));
                    } finally {
                        connection.closeSync();
                    }
                },

                searchContent: async (_parent, args) => {
                    const connection = await instance.connect();
                    try {
                        const result = await connection.run(`
                            SELECT fileName, content, meta.tokens as tokens, meta.chunkIndex as chunkIndex
                            FROM repo
                            WHERE content ILIKE '%${args.query.replace(/'/g, "''")}%'
                            LIMIT ${args.limit}
                        `);
                        return (await result.getRows()).map((row: any) => ({
                            fileName: row[0],
                            content: row[1],
                            tokens: Number(row[2]),
                            chunkIndex: Number(row[3])
                        }));
                    } finally {
                        connection.closeSync();
                    }
                },

                fileChunks: async (_parent, args) => {
                    const connection = await instance.connect();
                    try {
                        const result = await connection.run(`
                            SELECT fileName, content, meta.tokens as tokens, meta.chunkIndex as chunkIndex
                            FROM repo
                            WHERE fileName = '${args.fileName.replace(/'/g, "''")}'
                            ORDER BY chunkIndex
                        `);
                        return (await result.getRows()).map((row: any) => ({
                            fileName: row[0],
                            content: row[1],
                            tokens: Number(row[2]),
                            chunkIndex: Number(row[3])
                        }));
                    } finally {
                        connection.closeSync();
                    }
                },

                fileStats: async (_parent, args) => {
                    const connection = await instance.connect();
                    try {
                        const whereClause = args.fileName
                            ? `WHERE fileName = '${args.fileName.replace(/'/g, "''")}'`
                            : '';

                        const result = await connection.run(`
                            SELECT
                                fileName,
                                COUNT(*) as totalChunks,
                                SUM(meta.tokens) as totalTokens,
                                AVG(meta.tokens) as avgTokensPerChunk
                            FROM repo
                            ${whereClause}
                            GROUP BY fileName
                            ORDER BY totalTokens DESC
                        `);
                        return (await result.getRows()).map((row: any) => ({
                            fileName: row[0],
                            totalChunks: Number(row[1]),
                            totalTokens: Number(row[2]),
                            avgTokensPerChunk: Number(row[3])
                        }));
                    } finally {
                        connection.closeSync();
                    }
                },

                largestChunks: async (_parent, args) => {
                    const connection = await instance.connect();
                    try {
                        const result = await connection.run(`
                            SELECT fileName, content, meta.tokens as tokens, meta.chunkIndex as chunkIndex
                            FROM repo
                            ORDER BY tokens DESC
                            LIMIT ${args.limit}
                        `);
                        return (await result.getRows()).map((row: any) => ({
                            fileName: row[0],
                            content: row[1],
                            tokens: Number(row[2]),
                            chunkIndex: Number(row[3])
                        }));
                    } finally {
                        connection.closeSync();
                    }
                },

                fileNames: async () => {
                    const connection = await instance.connect();
                    try {
                        const result = await connection.run(`
                            SELECT DISTINCT fileName
                            FROM repo
                            ORDER BY fileName
                        `);
                        const rows = await result.getRows();
                        console.log('Row sample:', JSON.stringify(rows[0]));
                        console.log('Row type:', typeof rows[0], Array.isArray(rows[0]));
                        return rows.map((row: any) => row.fileName || row[0]);
                    } finally {
                        connection.closeSync();
                    }
                },

                readFile: async (_parent, args) => {
                    const full = safeResolvePath(args.path);
                    return readFileSync(full, 'utf-8');
                },

                listPackages: async () => {
                    const pkgsDir = resolve(repoRoot, 'packages');
                    if (!existsSync(pkgsDir)) return [];
                    return readdirSync(pkgsDir)
                        .filter((name) => {
                            const full = resolve(pkgsDir, name);
                            try {
                                return statSync(full).isDirectory();
                            } catch {
                                return false;
                            }
                        });
                },

                packages: async () => {
                    const pkgs = findPackages(repoRoot);
                    return pkgs.map(p => ({ name: p.name, dir: p.dir, hasBuild: Boolean(p.scripts?.build) }));
                },

                detectPackageManager: () => detectPackageManager(repoRoot),

                agentSession: (_parent, args) => {
                    return sessions.get(String(args.id)) || null;
                },

                projectSession: (_parent, args) => {
                    return projectSessions.get(String(args.id)) || null;
                }
            }
            ,
            Mutation: {
                writeFile: async (_parent, args) => {
                    const full = safeResolvePath(args.path);
                    writeFileSync(full, String(args.content));
                    return true;
                },

                startAgent: async (_parent, args) => {
                    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const session: AgentSession = {
                        id,
                        goal: String(args.goal),
                        createdAt: Date.now(),
                        status: 'running',
                        steps: [
                            { id: '1', description: 'Analyze repository structure', status: 'pending' },
                            { id: '2', description: 'Detect package manager and packages', status: 'pending' },
                            { id: '3', description: 'Install dependencies', status: 'pending' },
                            { id: '4', description: 'Build workspace (topological)', status: 'pending' },
                            { id: '5', description: 'Summarize results', status: 'pending' },
                        ],
                    };
                    sessions.set(id, session);

                    // Run simple autonomous flow in background
                    queueMicrotask(async () => {
                        try {
                            // Step 1: Analyze
                            session.steps[0].status = 'in_progress';
                            const files = readdirSync(repoRoot);
                            session.steps[0].output = `Found ${files.length} top-level entries.`;
                            session.steps[0].status = 'completed';

                            // Step 2: Detect manager and packages
                            session.steps[1].status = 'in_progress';
                            const manager = detectPackageManager(repoRoot);
                            const pkgs = findPackages(repoRoot);
                            session.steps[1].output = `Manager: ${manager}\nPackages: ${pkgs.map(p=>p.name).join(', ') || '(none)'}\nBuildable: ${pkgs.filter(p=>p.scripts?.build).map(p=>p.name).join(', ') || '(none)'}`;
                            session.steps[1].status = 'completed';

                            // Step 3: Install
                            session.steps[2].status = 'in_progress';
                            const installRes = await runInstall(repoRoot, manager);
                            session.steps[2].output = installRes.logs.slice(-4000);
                            session.steps[2].status = installRes.success ? 'completed' : 'failed';

                            // Step 4: Build workspace
                            session.steps[3].status = 'in_progress';
                            const buildRes = await buildWorkspace(repoRoot, manager);
                            session.steps[3].output = buildRes.logs.slice(-4000);
                            session.steps[3].status = buildRes.success ? 'completed' : 'failed';

                            // Step 5: Summarize
                            session.steps[4].status = 'in_progress';
                            session.steps[4].output = buildRes.success ? 'Build succeeded.' : 'Build failed.';
                            session.steps[4].status = 'completed';
                            session.status = buildRes.success ? 'completed' : 'failed';
                        } catch (e: any) {
                            session.status = 'failed';
                            const step = session.steps.find((s) => s.status === 'in_progress' || s.status === 'pending');
                            if (step) {
                                step.status = 'failed';
                                step.output = String(e?.message || e);
                            }
                        }
                    });

                    return session;
                },

                buildAllPackages: async () => {
                    const packagesDir = resolve(repoRoot, 'packages');
                    const targets = existsSync(packagesDir)
                        ? readdirSync(packagesDir)
                              .map((p) => resolve(packagesDir, p))
                              .filter((p) => {
                                  try { return statSync(p).isDirectory(); } catch { return false; }
                              })
                        : [];
                    const res = await buildAll(targets);
                    return res;
                },

                installDependencies: async () => {
                    const manager = detectPackageManager(repoRoot);
                    return runInstall(repoRoot, manager);
                },

                buildWorkspace: async () => {
                    const manager = detectPackageManager(repoRoot);
                    return buildWorkspace(repoRoot, manager);
                },

                buildPackage: async (_p, args) => {
                    const manager = detectPackageManager(repoRoot);
                    const pkgs = findPackages(repoRoot);
                    const pkg = pkgs.find(p => p.name === String(args.name));
                    if (!pkg) return { success: false, logs: `Package ${args.name} not found` };
                    const res = await runBuildInDir(pkg.dir, manager);
                    return res;
                },

                startProjectBuild: async (_p, args) => {
                    return beginProjectBuild({
                        name: String(args.name || 'todo-app'),
                        language: String(args.language || 'javascript'),
                        framework: args.framework ? String(args.framework) : null,
                        spec: String(args.spec || ''),
                        runInstall: Boolean(args.runInstall),
                        runBuild: Boolean(args.runBuild),
                    }, repoRoot, projectSessions);
                },

                buildFromPrompt: async (_p, args) => {
                    const prompt: string = String(args.prompt || '');
                    // crude language detection from prompt
                    const langMatch = prompt.match(/\b(in|using)\s+([A-Za-z+\-#]+)/i);
                    const language = langMatch ? langMatch[2].toLowerCase() : 'javascript';
                    const nameMatch = prompt.match(/\bcalled\s+([A-Za-z0-9-_]+)/i);
                    const name = nameMatch ? nameMatch[1] : 'todo-app';
                    return beginProjectBuild({ name, language, framework: null, spec: prompt, runInstall: true, runBuild: false }, repoRoot, projectSessions);
                },
            }
        }
    });

    // Create GraphQL Yoga server
    const yoga = createYoga({
        schema,
        graphiql: true, // Enable GraphiQL interface
        landingPage: false,
        cors: {
            origin: "*",
        }
    });

    // Create HTTP server
    const server = createServer(yoga);
    const port = 4000;

    server.listen(port, () => {
        console.log(`🚀 GraphQL Server ready at http://localhost:${port}/graphql`);
        console.log(`📊 GraphiQL interface available for testing`);
    });

    // Cleanup on exit
    process.on('SIGINT', () => {
        clearInterval(updateInterval);
        if (tempFilePath) {
            try {
                unlinkSync(tempFilePath);
            } catch (error) {
                console.warn('Failed to clean up temp file:', error);
            }
        }
        instance.closeSync();
        server.close();
        process.exit(0);
    });

    return server;
}

async function buildAll(packageDirs: string[]): Promise<{ success: boolean; logs: string }> {
    let allLogs = '';
    let overallSuccess = true;
    for (const dir of packageDirs) {
        const result = await runBuildInDir(dir);
        allLogs += `\n# Build in ${dir}\n${result.logs}\n`;
        if (!result.success) overallSuccess = false;
    }
    if (packageDirs.length === 0) {
        return { success: false, logs: 'No packages directory found.' };
    }
    return { success: overallSuccess, logs: allLogs };
}

async function runBuildInDir(dir: string, preferred?: PackageManager): Promise<{ success: boolean; logs: string }> {
    const logs: string[] = [];
    function has(file: string) { return existsSync(resolve(dir, file)); }
    let cmd = '';
    let args: string[] = [];
    const effective = preferred || (has('bun.lockb') ? 'bun' : has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm');
    if (effective === 'bun') { cmd = 'bun'; args = ['run', 'build']; }
    else if (effective === 'pnpm') { cmd = 'pnpm'; args = ['-s', 'run', 'build']; }
    else if (effective === 'yarn') { cmd = 'yarn'; args = ['run', 'build']; }
    else { cmd = 'npm'; args = ['run', 'build']; }

    logs.push(`Running ${cmd} ${args.join(' ')} in ${dir}`);

    return new Promise((resolvePromise) => {
        const child = spawn(cmd, args, { cwd: dir, shell: process.platform === 'win32' });
        child.stdout.on('data', (d) => logs.push(d.toString()));
        child.stderr.on('data', (d) => logs.push(d.toString()));
        child.on('close', (code) => resolvePromise({ success: code === 0, logs: logs.join('') }));
        child.on('error', (err) => resolvePromise({ success: false, logs: logs.join('') + `\nError: ${String(err)}` }));
    });
}

type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

function detectPackageManager(root: string): PackageManager {
    if (existsSync(resolve(root, 'bun.lockb'))) return 'bun';
    if (existsSync(resolve(root, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(resolve(root, 'yarn.lock'))) return 'yarn';
    return 'npm';
}

function findPackages(root: string): Array<{ name: string; dir: string; scripts?: Record<string, string>; deps: Set<string> }> {
    const pkgsDir = resolve(root, 'packages');
    if (!existsSync(pkgsDir)) return [];
    const entries = readdirSync(pkgsDir).map((name) => resolve(pkgsDir, name)).filter((p) => {
        try { return statSync(p).isDirectory(); } catch { return false; }
    });
    const result: Array<{ name: string; dir: string; scripts?: Record<string, string>; deps: Set<string> }> = [];
    for (const dir of entries) {
        const pkgJsonPath = resolve(dir, 'package.json');
        if (!existsSync(pkgJsonPath)) continue;
        try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            const deps = new Set<string>([
                ...Object.keys(pkg.dependencies || {}),
                ...Object.keys(pkg.devDependencies || {}),
                ...Object.keys(pkg.peerDependencies || {}),
            ]);
            result.push({ name: String(pkg.name || dir.split('/').pop()), dir, scripts: pkg.scripts || {}, deps });
        } catch {}
    }
    return result;
}

function topoOrder(pkgs: ReturnType<typeof findPackages>): string[] {
    const nameToIdx = new Map<string, number>();
    pkgs.forEach((p, i) => nameToIdx.set(p.name, i));
    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    pkgs.forEach((p) => { indeg.set(p.name, 0); adj.set(p.name, []); });

    // Edge dep -> pkg if pkg depends on dep and dep exists in monorepo
    for (const p of pkgs) {
        for (const dep of p.deps) {
            if (nameToIdx.has(dep)) {
                adj.get(dep)!.push(p.name);
                indeg.set(p.name, (indeg.get(p.name) || 0) + 1);
            }
        }
    }
    const queue: string[] = [];
    indeg.forEach((d, n) => { if (d === 0) queue.push(n); });
    const order: string[] = [];
    while (queue.length) {
        const n = queue.shift()!;
        order.push(n);
        for (const m of adj.get(n) || []) {
            const d = (indeg.get(m) || 0) - 1;
            indeg.set(m, d);
            if (d === 0) queue.push(m);
        }
    }
    // If cycle, append remaining in any order
    if (order.length < pkgs.length) {
        for (const p of pkgs) if (!order.includes(p.name)) order.push(p.name);
    }
    return order;
}

async function runInstall(root: string, manager: PackageManager): Promise<{ success: boolean; logs: string }> {
    const logs: string[] = [];
    let cmd = manager;
    let args: string[] = [];
    if (manager === 'bun') args = ['install'];
    else if (manager === 'pnpm') args = ['install'];
    else if (manager === 'yarn') args = ['install'];
    else args = ['install'];
    logs.push(`Running ${cmd} ${args.join(' ')} in ${root}`);
    return new Promise((resolvePromise) => {
        const child = spawn(cmd, args, { cwd: root, shell: process.platform === 'win32' });
        child.stdout.on('data', (d) => logs.push(d.toString()));
        child.stderr.on('data', (d) => logs.push(d.toString()));
        child.on('close', (code) => resolvePromise({ success: code === 0, logs: logs.join('') }));
        child.on('error', (err) => resolvePromise({ success: false, logs: logs.join('') + `\nError: ${String(err)}` }));
    });
}

async function buildWorkspace(root: string, manager: PackageManager): Promise<{ success: boolean; logs: string }> {
    const pkgs = findPackages(root);
    const order = topoOrder(pkgs);
    const byName = new Map(pkgs.map(p => [p.name, p] as const));
    let overall = true;
    let logs = `Build order: ${order.join(' -> ')}\n`;
    for (const name of order) {
        const info = byName.get(name)!;
        if (!info.scripts?.build) {
            logs += `\nSkipping ${name} (no build script)`;
            continue;
        }
        const res = await runBuildInDir(info.dir, manager);
        logs += `\n# ${name} (${info.dir})\n${res.logs}\n`;
        if (!res.success) overall = false;
    }
    return { success: overall, logs };
}

function beginProjectBuild(
    cfg: { name: string; language: string; framework: string | null; spec: string; runInstall: boolean; runBuild: boolean },
    repoRoot: string,
    sessions: Map<string, any>
): any {
    const { name, language, framework, spec, runInstall, runBuild } = cfg;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = slugify(name);
    const targetDir = resolve(repoRoot, 'projects', slug);
    const sess: any = {
        id,
        name,
        language,
        framework,
        spec,
        targetDir,
        createdAt: Date.now(),
        status: 'running',
        steps: [
            { id: '1', description: 'Select template and plan files', status: 'pending' },
            { id: '2', description: 'Write project files', status: 'pending' },
            { id: '3', description: 'Install dependencies', status: 'pending' },
            { id: '4', description: 'Build project', status: 'pending' },
            { id: '5', description: 'Summarize results', status: 'pending' },
        ],
    };
    sessions.set(id, sess);

    queueMicrotask(async () => {
        try {
            // Step 1: choose template
            sess.steps[0].status = 'in_progress';
            const tmpl = chooseTemplate(language, framework, spec);
            sess.steps[0].output = `Template: ${tmpl.name} -> ${targetDir}`;
            sess.steps[0].status = 'completed';

            // Step 2: write files
            sess.steps[1].status = 'in_progress';
            const tree = tmpl.generate({ name, slug, spec });
            writeTree(targetDir, tree);
            sess.steps[1].output = `Wrote ${Object.keys(tree).length} files.`;
            sess.steps[1].status = 'completed';

            // Step 3: install
            if (runInstall && tmpl.install) {
                sess.steps[2].status = 'in_progress';
                const res = await tmpl.install(targetDir);
                sess.steps[2].output = res.logs.slice(-4000);
                sess.steps[2].status = res.success ? 'completed' : 'failed';
                if (!res.success) throw new Error('Install failed');
            } else {
                sess.steps[2].status = 'completed';
                sess.steps[2].output = 'Install skipped';
            }

            // Step 4: build
            if (runBuild && tmpl.build) {
                sess.steps[3].status = 'in_progress';
                const res = await tmpl.build(targetDir);
                sess.steps[3].output = res.logs.slice(-4000);
                sess.steps[3].status = res.success ? 'completed' : 'failed';
                if (!res.success) throw new Error('Build failed');
            } else {
                sess.steps[3].status = 'completed';
                sess.steps[3].output = 'Build skipped';
            }

            // Step 5: done
            sess.steps[4].status = 'in_progress';
            sess.steps[4].output = `Project created at ${relativeToRepo(targetDir, repoRoot)}`;
            sess.steps[4].status = 'completed';
            sess.status = 'completed';
        } catch (e: any) {
            sess.status = 'failed';
            const step = sess.steps.find((s: any) => s.status === 'in_progress' || s.status === 'pending');
            if (step) {
                step.status = 'failed';
                step.output = String(e?.message || e);
            }
        }
    });

    return sess;
}

function slugify(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') || 'project';
}

function ensureDir(dir: string) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function relativeToRepo(path: string, root: string) {
    return path.startsWith(root) ? path.slice(root.length + 1) : path;
}

type FileTree = Record<string, string>;

function writeTree(root: string, tree: FileTree) {
    ensureDir(root);
    for (const [rel, content] of Object.entries(tree)) {
        const full = resolve(root, rel);
        ensureDir(dirname(full));
        writeFileSync(full, content);
    }
}

type Template = {
    name: string;
    generate: (ctx: { name: string; slug: string; spec: string }) => FileTree;
    install?: (dir: string) => Promise<{ success: boolean; logs: string }>;
    build?: (dir: string) => Promise<{ success: boolean; logs: string }>;
};

function chooseTemplate(language: string, framework: string | null, spec: string): Template {
    const lang = language.toLowerCase();
    if (lang.includes('python')) return fastApiTemplate(spec);
    if (lang === 'go' || lang.includes('golang')) return goNetHttpTemplate(spec);
    return reactViteTemplate(spec);
}

function reactViteTemplate(spec: string): Template {
    return {
        name: 'react-vite-ts-todo',
        generate: ({ name, slug }) => {
            const pkg = {
                name: slug,
                private: true,
                version: '0.1.0',
                type: 'module',
                scripts: {
                    dev: 'vite',
                    build: 'tsc -b && vite build',
                    preview: 'vite preview'
                },
                dependencies: {
                    react: '^19.1.1',
                    'react-dom': '^19.1.1'
                },
                devDependencies: {
                    typescript: '~5.9.3',
                    vite: '^7.1.7',
                    '@vitejs/plugin-react-swc': '^4.1.0'
                }
            };
            const files: FileTree = {
                'package.json': JSON.stringify(pkg, null, 2) + '\n',
                'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', jsx: 'react-jsx', moduleResolution: 'Bundler', strict: true } }, null, 2) + '\n',
                'index.html': `<!doctype html>\n<html>\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>${name}</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>\n`,
                'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react-swc'\nexport default defineConfig({ plugins: [react()] })\n`,
                'src/main.tsx': `import { createRoot } from 'react-dom/client'\nimport React from 'react'\nimport App from './App'\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)\n`,
                'src/App.tsx': `import { useEffect, useState } from 'react'\n\n type Todo = { id: string; text: string; done: boolean }\n const load = (): Todo[] => JSON.parse(localStorage.getItem('todos') || '[]')\n const save = (t: Todo[]) => localStorage.setItem('todos', JSON.stringify(t))\n\n export default function App(){\n   const [todos, setTodos] = useState<Todo[]>(load())\n   const [text, setText] = useState('')\n   useEffect(()=>save(todos),[todos])\n   const add = () => { if(!text.trim()) return; setTodos([{ id: crypto.randomUUID(), text, done:false }, ...todos]); setText('') }\n   const toggle = (id:string)=> setTodos(t=>t.map(x=>x.id===id?{...x,done:!x.done}:x))\n   const del = (id:string)=> setTodos(t=>t.filter(x=>x.id!==id))\n   return (<div style={{maxWidth:600,margin:'2rem auto',fontFamily:'system-ui'}}>\n     <h1>Todo</h1>\n     <p>${spec.replace(/`/g,'') || 'A simple todo app.'}</p>\n     <input value={text} onChange={e=>setText(e.target.value)} placeholder='Add a task' />\n     <button onClick={add}>Add</button>\n     <ul>\n      {todos.map(t=> (\n        <li key={t.id}>\n          <input type='checkbox' checked={t.done} onChange={()=>toggle(t.id)} />\n          <span style={{textDecoration: t.done?'line-through':'none', marginLeft:8}}>{t.text}</span>\n          <button onClick={()=>del(t.id)} style={{marginLeft:8}}>Delete</button>\n        </li>))}\n     </ul>\n   </div>)\n }\n`,
                'README.md': `# ${name}\n\nGenerated by Code Agent.\n\nCommands:\n- dev: vite dev server\n- build: production build\n\n`,
            };
            return files;
        },
        install: async (dir: string) => {
            // Default to npm for portability
            return runInstall(dir, 'npm');
        },
        build: async (dir: string) => runBuildInDir(dir)
    };
}

function fastApiTemplate(spec: string): Template {
    return {
        name: 'python-fastapi-sqlite-todo',
        generate: ({ name, slug }) => {
            const files: FileTree = {
                'requirements.txt': `fastapi==0.115.5\nuvicorn==0.32.0\nsqlite-utils==3.37.2\n`,
                'main.py': `from fastapi import FastAPI, HTTPException\nfrom pydantic import BaseModel\nfrom typing import List\nimport sqlite3\n\napp = FastAPI(title='${name}')\n\nclass Todo(BaseModel):\n    id: int | None = None\n    text: str\n    done: bool = False\n\ncon = sqlite3.connect('todos.db', check_same_thread=False)\ncur = con.cursor()\ncur.execute('CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, done INTEGER)')\ncon.commit()\n\n@app.get('/todos', response_model=List[Todo])\ndef list_todos():\n    cur.execute('SELECT id, text, done FROM todos ORDER BY id DESC')\n    rows = cur.fetchall()\n    return [Todo(id=r[0], text=r[1], done=bool(r[2])) for r in rows]\n\n@app.post('/todos', response_model=Todo)\ndef create_todo(t: Todo):\n    cur.execute('INSERT INTO todos(text, done) VALUES (?, ?)', (t.text, int(t.done)))\n    con.commit()\n    t.id = cur.lastrowid\n    return t\n\n@app.patch('/todos/{id}', response_model=Todo)\ndef toggle_todo(id: int):\n    cur.execute('SELECT id, text, done FROM todos WHERE id=?', (id,))\n    row = cur.fetchone()\n    if not row: raise HTTPException(404, 'Not found')\n    done = 0 if row[2] else 1\n    cur.execute('UPDATE todos SET done=? WHERE id=?', (done, id))\n    con.commit()\n    return Todo(id=row[0], text=row[1], done=bool(done))\n\n@app.delete('/todos/{id}')\ndef delete_todo(id: int):\n    cur.execute('DELETE FROM todos WHERE id=?', (id,))\n    con.commit()\n    return {'ok': True}\n`,
                'static/index.html': `<!doctype html>\n<html><head><meta charset='utf-8'/>\n<meta name='viewport' content='width=device-width, initial-scale=1'/>\n<title>${name}</title></head>\n<body style='font-family:system-ui;max-width:700px;margin:2rem auto'>\n  <h1>Todo</h1>\n  <p>${spec.replace(/`/g,'') || 'A simple todo app.'}</p>\n  <input id='text' placeholder='Add a task'><button id='add'>Add</button>\n  <ul id='list'></ul>\n<script>\nasync function refresh(){\n  const r=await fetch('/todos'); const t=await r.json();\n  const ul=document.getElementById('list'); ul.innerHTML='';\n  for(const it of t){\n    const li=document.createElement('li');\n    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=it.done; cb.onchange=()=>fetch('/todos/'+it.id,{method:'PATCH'}).then(refresh);\n    const sp=document.createElement('span'); sp.textContent=it.text; sp.style.marginLeft='8px'; if(it.done) sp.style.textDecoration='line-through';\n    const del=document.createElement('button'); del.textContent='Delete'; del.style.marginLeft='8px'; del.onclick=()=>fetch('/todos/'+it.id,{method:'DELETE'}).then(refresh);\n    li.append(cb, sp, del); ul.append(li);\n  }\n}\nrefresh();\n document.getElementById('add').onclick=()=>{ const v=document.getElementById('text').value.trim(); if(!v) return; fetch('/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:v})}).then(()=>{document.getElementById('text').value='';refresh()}) }\n</script>\n</body></html>\n`,
                'README.md': `# ${name}\n\nGenerated by Code Agent.\n\nRun: \n- Install: python -m pip install -r requirements.txt\n- Dev: uvicorn main:app --reload --port 8000\n`,
                '.gitignore': `__pycache__/\n*.db\nvenv/\n`,
            };
            return files;
        },
        install: async (dir: string) => {
            const cmds = [['python3','-m','pip','install','-r','requirements.txt'], ['python','-m','pip','install','-r','requirements.txt'], ['pip','install','-r','requirements.txt']];
            let logs='';
            for (const parts of cmds) {
                const res = await runCommand(dir, parts[0], parts.slice(1));
                logs += `\n$ ${parts.join(' ')}\n${res.logs}\n`;
                if (res.success) return { success: true, logs };
            }
            return { success: false, logs };
        },
        build: async (_dir: string) => ({ success: true, logs: 'Python FastAPI has no build step; run uvicorn.' })
    };
}

async function runCommand(cwd: string, cmd: string, args: string[]): Promise<{ success: boolean; logs: string }> {
    const logs: string[] = [];
    logs.push(`Running ${cmd} ${args.join(' ')} in ${cwd}`);
    return new Promise((resolvePromise) => {
        const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
        child.stdout.on('data', (d) => logs.push(d.toString()));
        child.stderr.on('data', (d) => logs.push(d.toString()));
        child.on('close', (code) => resolvePromise({ success: code === 0, logs: logs.join('') }));
        child.on('error', (err) => resolvePromise({ success: false, logs: logs.join('') + `\nError: ${String(err)}` }));
    });
}

function goNetHttpTemplate(spec: string): Template {
    return {
        name: 'go-nethttp-todo',
        generate: ({ name, slug }) => {
            const files: FileTree = {
                'go.mod': `module ${slug}\n\ngo 1.22\n\nrequire github.com/mattn/go-sqlite3 v1.14.22\n`,
                'main.go': `package main\n\nimport (\n  "database/sql"\n  "embed"\n  "encoding/json"\n  "fmt"\n  "log"\n  "net/http"\n  _ "github.com/mattn/go-sqlite3"\n)\n\n//go:embed static/*\nvar staticFS embed.FS\n\ntype Todo struct {\n  ID int64 ` + "`json:\"id\"`" + `\n  Text string ` + "`json:\"text\"`" + `\n  Done bool ` + "`json:\"done\"`" + `\n}\n\nfunc main(){\n  db, err := sql.Open("sqlite3", "todos.db")\n  if err != nil { log.Fatal(err) }\n  _, _ = db.Exec("CREATE TABLE IF NOT EXISTS todos(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, done INTEGER)")\n\n  http.HandleFunc("/todos", func(w http.ResponseWriter, r *http.Request){\n    switch r.Method {\n    case http.MethodGet:\n      rows, _ := db.Query("SELECT id, text, done FROM todos ORDER BY id DESC")\n      defer rows.Close()\n      var out []Todo\n      for rows.Next(){ var t Todo; var done int; rows.Scan(&t.ID,&t.Text,&done); t.Done = done==1; out = append(out, t) }\n      json.NewEncoder(w).Encode(out)\n    case http.MethodPost:\n      var t Todo; json.NewDecoder(r.Body).Decode(&t)\n      res, _ := db.Exec("INSERT INTO todos(text,done) VALUES(?,?)", t.Text, 0)\n      id,_ := res.LastInsertId(); t.ID = id; json.NewEncoder(w).Encode(t)\n    default:\n      w.WriteHeader(405)\n    }\n  })\n\n  http.HandleFunc("/todos/", func(w http.ResponseWriter, r *http.Request){\n    var id int64; _, _ = fmt.Sscanf(r.URL.Path, "/todos/%d", &id)\n    switch r.Method {\n    case http.MethodPatch:\n      _, _ = db.Exec("UPDATE todos SET done = 1 - done WHERE id = ?", id); w.Write([]byte("{}"))\n    case http.MethodDelete:\n      _, _ = db.Exec("DELETE FROM todos WHERE id = ?", id); w.Write([]byte("{}"))\n    default:\n      w.WriteHeader(405)\n    }\n  })\n\n  fs := http.FS(staticFS)\n  http.Handle("/", http.FileServer(fs))\n  log.Println("Serving on :8080")\n  log.Fatal(http.ListenAndServe(":8080", nil))\n}\n`,
                'static/index.html': `<!doctype html><html><head><meta charset='utf-8'/><title>${name}</title></head><body style='font-family:system-ui;max-width:700px;margin:2rem auto'><h1>Todo</h1><p>${spec.replace(/`/g,'')}</p><input id='text'/><button id='add'>Add</button><ul id='list'></ul><script>async function refresh(){const r=await fetch('/todos');const t=await r.json();const ul=document.getElementById('list');ul.innerHTML='';for(const it of t){const li=document.createElement('li');const cb=document.createElement('input');cb.type='checkbox';cb.checked=it.done;cb.onchange=()=>fetch('/todos/'+it.id,{method:'PATCH'}).then(refresh);const sp=document.createElement('span');sp.textContent=it.text;sp.style.marginLeft='8px';if(it.done) sp.style.textDecoration='line-through';const del=document.createElement('button');del.textContent='Delete';del.style.marginLeft='8px';del.onclick=()=>fetch('/todos/'+it.id,{method:'DELETE'}).then(refresh);li.append(cb, sp, del);ul.append(li);} } refresh(); document.getElementById('add').onclick=()=>{const v=document.getElementById('text').value.trim(); if(!v) return; fetch('/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:v})}).then(()=>{document.getElementById('text').value='';refresh()}) }</script></body></html>\n`,
                'README.md': `# ${name}\n\nRun:\n- go mod tidy\n- go run .\n- open http://localhost:8080\n`,
                '.gitignore': `*.db\n`,
            };
            return files;
        },
        install: async (dir: string) => runCommand(dir, 'go', ['mod', 'tidy']),
        build: async (dir: string) => runCommand(dir, 'go', ['build', '.'])
    };
}



// export async function watchRepo() {
//     const instance = await DuckDBInstance.create(':memory:');
//
//     const intervalId = setInterval(async () => {
//         try {
//
//             const generator = new MarkdownGenerator({
//                 dir: "../../",
//                 verbose: true,
//             });
//
//             const repoChunks = await generator.splitByTokens(256);
//             const files = await generator.getTrackedFiles();
//
//             // Connect to DuckDB
//             const connection = await instance.connect();
//
//             // Convert repoChunks (JS object/array) to JSON and write to temp file
//             const repoJson = JSON.stringify(repoChunks);
//             const tempFilePath = join(tmpdir(), `repo-chunks-${Date.now()}.json`);
//
//             try {
//                 writeFileSync(tempFilePath, repoJson, 'utf-8');
//
//                 // Create a view from the JSON data file
//                 await connection.run(`
//           CREATE OR REPLACE VIEW repo AS
//           SELECT * FROM read_json('${tempFilePath}');
//         `);
//
//                 // Now you can query it as a SQL table
//                 const result = await connection.run(`
//           SELECT fileName, length(content) AS content_length
//           FROM repo
//           WHERE content_length > 1000
//           ORDER BY content_length DESC
//           LIMIT 5;
//         `);
//
//                 console.log("Top 5 large chunks:", result);
//             } finally {
//                 // Clean up temp file
//                 try {
//                     unlinkSync(tempFilePath);
//                 } catch (cleanupError) {
//                     console.warn('Failed to clean up temp file:', cleanupError);
//                 }
//                 connection.closeSync();
//             }
//         } catch (error) {
//             console.error('Error executing DuckDB operation:', error);
//         }
//     }, 5000);
//
//     process.on('SIGINT', () => {
//         clearInterval(intervalId);
//         instance.closeSync();
//         process.exit(0);
//     });
// }
