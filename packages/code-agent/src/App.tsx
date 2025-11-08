import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  Box,
  Button,
  Code,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Spinner,
  Stack,
  Tabs,
  Text,
  Textarea
} from "@chakra-ui/react";

import {toaster} from "./components/ui/toaster"

function useToast() {
  const doToast = (params: any) => toaster.create({...params})
  return doToast
}

const GRAPHQL_URL = (import.meta.env.VITE_GRAPHQL_URL as string) || "/graphql";

async function gql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e: any) => e.message).join("\n"));
  return json.data as T;
}

function useInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}

function App() {
  return (
    <Stack gap={6} p={6} maxW={1200} mx="auto">
      <Heading size="lg">Code Agent</Heading>
      <Tabs.Root defaultValue="repo">
        <Tabs.List>
          <Tabs.Trigger value="repo">Repo</Tabs.Trigger>
          <Tabs.Trigger value="search">Search</Tabs.Trigger>
          <Tabs.Trigger value="build">Build</Tabs.Trigger>
          <Tabs.Trigger value="agent">Agent</Tabs.Trigger>
          <Tabs.Trigger value="create">Create</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="repo">
          <RepoBrowser />
        </Tabs.Content>
        <Tabs.Content value="search">
          <SearchPanel />
        </Tabs.Content>
        <Tabs.Content value="build">
          <BuildPanel />
        </Tabs.Content>
        <Tabs.Content value="agent">
          <AgentPanel />
        </Tabs.Content>
        <Tabs.Content value="create">
          <CreateProjectPanel />
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}

function RepoBrowser() {
  const toast = useToast();
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    gql<{ fileNames: string[] }>(`query { fileNames }`)
      .then((d) => setFiles(d.fileNames))
      .catch((e) => toast({ status: "error", title: "Error", description: e.message }));
  }, [toast]);

  const loadFile = async (path: string) => {
    setLoading(true);
    try {
      const d = await gql<{ readFile: string }>(`query($path:String!){ readFile(path:$path) }`, { path });
      setContent(d.readFile);
    } catch (e: any) {
      setContent("");
      toast({ status: "error", title: "Read error", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap={3}>
      <HStack align="start" gap={4}>
        <Box w="40%">
          <Text mb={2} fontWeight="bold">Files</Text>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field value={selected} onChange={(e) => { setSelected(e.target.value); loadFile(e.target.value); }}>
              <option value="">Select a file</option>
              {files.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
          <Text mt={3} fontSize="sm">Showing repository files provided by repo-data-api.</Text>
        </Box>
        <Box flex={1}>
          <Text mb={2} fontWeight="bold">Content</Text>
          <Box borderWidth="1px" borderRadius="md" p={2} minH={300} bg="blackAlpha.50" whiteSpace="pre-wrap" fontFamily="mono">
            {loading ? <Spinner /> : content || <Text color="gray.500">No file selected</Text>}
          </Box>
        </Box>
      </HStack>
    </Stack>
  );
}

function CreateProjectPanel() {
  const toast = useToast();
  const [name, setName] = useState("todo-app");
  const [language, setLanguage] = useState("javascript");
  const [framework, setFramework] = useState("");
  const [spec, setSpec] = useState("Build me a todo app with create/read/update/delete, mark complete, and store locally.");
  const [runInstall, setRunInstall] = useState(true);
  const [runBuild, setRunBuild] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [quick, setQuick] = useState("Build me a todo app in JavaScript called quick-todo");

  const start = async () => {
    setLoading(true);
    try {
      const d = await gql<{ startProjectBuild: any }>(
        `mutation($n:String!,$l:String!,$f:String,$s:String!,$ri:Boolean,$rb:Boolean){ startProjectBuild(name:$n, language:$l, framework:$f, spec:$s, runInstall:$ri, runBuild:$rb){ id name language framework spec targetDir status createdAt steps{ id description status output } } }`,
        { n: name, l: language, f: framework || null, s: spec, ri: runInstall, rb: runBuild }
      );
      setSessionId(d.startProjectBuild.id);
      setSession(d.startProjectBuild);
      toast({ status: "success", title: "Project build started" });
    } catch (e: any) {
      toast({ status: "error", title: "Start error", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useInterval(() => {
    if (!sessionId) return;
    gql<{ projectSession: any }>(`query($id:ID!){ projectSession(id:$id){ id name language framework spec targetDir status createdAt steps{ id description status output } } }`, { id: sessionId })
      .then((d) => setSession(d.projectSession))
      .catch(() => {});
  }, sessionId && (!session || (session.status !== 'completed' && session.status !== 'failed')) ? 1000 : null);

  return (
    <Stack gap={3}>
      <Box>
        <Text>Quick prompt</Text>
        <HStack>
          <Input value={quick} onChange={(e)=>setQuick(e.target.value)} />
          <Button onClick={async ()=>{
            setLoading(true);
            try {
              const d = await gql<{ buildFromPrompt: any }>(`mutation($p:String!){ buildFromPrompt(prompt:$p){ id name language framework spec targetDir status createdAt steps{ id description status output } } }`, { p: quick });
              setSessionId(d.buildFromPrompt.id);
              setSession(d.buildFromPrompt);
              toast({ status: "success", title: "Quick build started" });
            } catch (e: any) {
              toast({ status: "error", title: "Quick build error", description: e.message });
            } finally { setLoading(false); }
          }}>Quick Build</Button>
        </HStack>
      </Box>
      <HStack>
        <Box w="30%">
          <Text>Name</Text>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Box>
        <Box w="30%">
          <Text>Language</Text>
          <NativeSelect.Root>
            <NativeSelect.Field value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="javascript">JavaScript (React + Vite)</option>
              <option value="python">Python (FastAPI)</option>
              <option value="go">Go (net/http + SQLite)</option>
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Box>
        <Box w="40%">
          <Text>Framework (optional)</Text>
          <Input value={framework} onChange={(e)=>setFramework(e.target.value)} placeholder="e.g., React, FastAPI" />
        </Box>
      </HStack>
      <Box>
        <Text>Spec</Text>
        <Textarea value={spec} onChange={(e)=>setSpec(e.target.value)} rows={6} />
      </Box>
      <HStack>
        <Button onClick={() => setRunInstall(!runInstall)} colorScheme={runInstall ? 'green' : 'gray'}>{runInstall ? 'Install: Yes' : 'Install: No'}</Button>
        <Button onClick={() => setRunBuild(!runBuild)} colorScheme={runBuild ? 'green' : 'gray'}>{runBuild ? 'Build: Yes' : 'Build: No'}</Button>
        <Button onClick={start} loading={loading}>Create Project</Button>
      </HStack>
      {session && (
        <Stack>
          <Text>Session: <Code>{session.id}</Code> · Status: {session.status} · Dir: <Code>{session.targetDir}</Code></Text>
          {session.steps.map((s:any) => (
            <Box key={s.id} borderWidth="1px" borderRadius="md" p={2}>
              <Text fontWeight="bold">[{s.status}] {s.description}</Text>
              {s.output && (
                <Textarea mt={2} value={s.output} readOnly rows={6} fontFamily="mono" />
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function SearchPanel() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ fileName: string; tokens: number; chunkIndex: number | null; content: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    setLoading(true);
    try {
      const d = await gql<{ searchContent: any[] }>(
        `query($q:String!){ searchContent(query:$q, limit: 20){ fileName tokens chunkIndex content } }`,
        { q: query }
      );
      setResults(d.searchContent);
    } catch (e: any) {
      toast({ status: "error", title: "Search error", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap={3}>
      <HStack>
        <Input placeholder="Search query" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button onClick={runSearch} loading={loading}>Search</Button>
      </HStack>
      <Stack>
        {results.map((r, idx) => (
          <Box key={idx} borderWidth="1px" borderRadius="md" p={2}>
            <Text fontWeight="bold">{r.fileName} {typeof r.chunkIndex === 'number' ? `#${r.chunkIndex}` : ''} · {r.tokens} tokens</Text>
            <Box mt={2} whiteSpace="pre-wrap" fontFamily="mono" bg="blackAlpha.50" p={2}>
              {r.content.slice(0, 1000)}
            </Box>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function BuildPanel() {
  const toast = useToast();
  const [manager, setManager] = useState<string>("");
  const [packages, setPackages] = useState<{ name: string; dir: string; hasBuild: boolean }[]>([]);
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    gql<{ detectPackageManager: string; packages: { name: string; dir: string; hasBuild: boolean }[] }>(`query{ detectPackageManager packages { name dir hasBuild } }`)
      .then((d) => { setManager(d.detectPackageManager); setPackages(d.packages); })
      .catch((e) => toast({ status: "error", title: "Error", description: e.message }));
  }, [toast]);

  const build = async () => {
    setLoading(true);
    try {
      const d = await gql<{ buildAllPackages: { success: boolean; logs: string } }>(`mutation{ buildAllPackages { success logs } }`);
      setLogs(d.buildAllPackages.logs);
      toast({ status: d.buildAllPackages.success ? "success" : "error", title: d.buildAllPackages.success ? "Build succeeded" : "Build failed" });
    } catch (e: any) {
      toast({ status: "error", title: "Build error", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const install = async () => {
    setLoading(true);
    try {
      const d = await gql<{ installDependencies: { success: boolean; logs: string } }>(`mutation{ installDependencies { success logs } }`);
      setLogs(d.installDependencies.logs);
      toast({ status: d.installDependencies.success ? "success" : "error", title: d.installDependencies.success ? "Install succeeded" : "Install failed" });
    } catch (e: any) {
      toast({ status: "error", title: "Install error", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const buildWorkspace = async () => {
    setLoading(true);
    try {
      const d = await gql<{ buildWorkspace: { success: boolean; logs: string } }>(`mutation{ buildWorkspace { success logs } }`);
      setLogs(d.buildWorkspace.logs);
      toast({ status: d.buildWorkspace.success ? "success" : "error", title: d.buildWorkspace.success ? "Workspace build succeeded" : "Workspace build failed" });
    } catch (e: any) {
      toast({ status: "error", title: "Workspace build error", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap={3}>
      <Text>Manager: <Code>{manager || '(detecting...)'}</Code></Text>
      <Text>
        Packages detected: {packages.length ? packages.map(p=>p.name).join(", ") : "(none)"}
      </Text>
      <HStack>
        <Button onClick={install} loading={loading} disabled={!packages.length}>Install Dependencies</Button>
        <Button onClick={buildWorkspace} loading={loading} disabled={!packages.some(p=>p.hasBuild)}>Build Workspace</Button>
        <Button onClick={build} loading={loading} disabled={!packages.length}>Build All (fallback)</Button>
      </HStack>
      <Box borderWidth="1px" borderRadius="md" p={2} minH={300} whiteSpace="pre-wrap" fontFamily="mono" bg="blackAlpha.50">
        {logs || <Text color="gray.500">Build logs will appear here</Text>}
      </Box>
    </Stack>
  );
}

function AgentPanel() {
  const toast = useToast();
  const [goal, setGoal] = useState("Build the monorepo and report status");
  const [sessionId, setSessionId] = useState<string>("");
  const [session, setSession] = useState<any>(null);

  const start = async () => {
    try {
      const d = await gql<{ startAgent: any }>(`mutation($g:String!){ startAgent(goal:$g){ id goal createdAt status steps { id description status output } } }`, { g: goal });
      setSessionId(d.startAgent.id);
      setSession(d.startAgent);
      toast({ status: "success", title: "Agent started" });
    } catch (e: any) {
      toast({ status: "error", title: "Start error", description: e.message });
    }
  };

  useInterval(() => {
    if (!sessionId) return;
    gql<{ agentSession: any }>(`query($id:ID!){ agentSession(id:$id){ id goal createdAt status steps{ id description status output } } }`, { id: sessionId })
      .then((d) => setSession(d.agentSession))
      .catch(() => {});
  }, sessionId && (!session || (session.status !== 'completed' && session.status !== 'failed')) ? 1000 : null);

  const statusColor = useMemo(() => ({ running: 'yellow', completed: 'green', failed: 'red', idle: 'gray' } as Record<string, string>), []);

  return (
    <Stack gap={3}>
      <HStack>
        <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Agent goal" />
        <Button onClick={start}>Start Agent</Button>
      </HStack>
      {session && (
        <Stack>
          <Text>Session: <Code>{session.id}</Code> · Status: <Text as="span" color={`${statusColor[session.status] || 'gray'}.500`}>{session.status}</Text></Text>
          <Stack>
            {session.steps.map((s: any) => (
              <Box key={s.id} borderWidth="1px" borderRadius="md" p={2}>
                <Text fontWeight="bold">[{s.status}] {s.description}</Text>
                {s.output && (
                  <Textarea mt={2} value={s.output} readOnly rows={6} fontFamily="mono" />
                )}
              </Box>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}

export default App;
