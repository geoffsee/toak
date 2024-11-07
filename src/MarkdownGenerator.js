import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import { readFile, writeFile } from 'fs/promises';
import llama3Tokenizer from 'llama3-tokenizer-js';
import { TokenCleaner } from './TokenCleaner.js';

export class MarkdownGenerator {
    constructor(options = {}) {
        this.dir = options.dir || '.';
        this.outputFilePath = options.outputFilePath || './prompt.md';
        this.fileTypeExclusions = new Set(options.fileTypeExclusions || ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.tiff', '.lockb', '.yaml', '.ico', '.ttf', '.css']);
        this.fileExclusions = options.fileExclusions || ['prompt.js', '.gitignore', '.env', '.dev.vars'];
        this.tokenCleaner = new TokenCleaner(options.customPatterns, options.customSecretPatterns);
        this.verbose = options.verbose ?? true;
    }

    async getTrackedFiles() {
        try {
            const output = this.execCommand('git ls-files');
            const trackedFiles = output.split('\n').filter(file => file.length > 0);
            if (this.verbose) console.log(`Total tracked files: ${trackedFiles.length}`);
            return trackedFiles.filter(file => {
                const fileExt = path.extname(file).toLowerCase();
                const isExcluded = this.fileExclusions.some(pattern => this.isFileExcluded(file, pattern));
                return !this.fileTypeExclusions.has(fileExt) && !isExcluded;
            });
        } catch (error) {
            if (this.verbose) console.error('Error fetching tracked files:', error);
            return [];
        }
    }

    isFileExcluded(filePath, pattern) {
        if (pattern.endsWith('/*')) {
            const directory = pattern.slice(0, -2);
            return filePath.startsWith(directory);
        }
        if (pattern.includes('/*')) {
            const [directory, ext] = pattern.split('/*');
            return filePath.startsWith(directory) && filePath.endsWith(ext);
        }
        return filePath === pattern;
    }

    async readFileContent(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const cleanedAndRedactedContent = this.tokenCleaner.cleanAndRedact(content);
            if (this.verbose) {
                const tokenCount = llama3Tokenizer.encode(cleanedAndRedactedContent).length;
                console.log(`${filePath}: Tokens[${tokenCount}]`);
            }
            return cleanedAndRedactedContent;
        } catch (error) {
            if (this.verbose) console.error(`Error reading file ${filePath}:`, error);
            return '';
        }
    }

    async generateMarkdown() {
        const trackedFiles = await this.getTrackedFiles();
        if (this.verbose) console.log(`Generating markdown for ${trackedFiles.length} files`);
        let markdownContent = '# Project Files\n\n';

        for (const file of trackedFiles) {
            const content = await this.readFileContent(path.join(this.dir, file));
            markdownContent += `## ${file}\n~~~\n${content.trim()}\n~~~\n`;
        }
        return markdownContent;
    }

    async getTodo() {
        try {
            console.log("getting project todo")
            return await readFile('./todo', 'utf-8');
        } catch (error) {
            if (error.code === 'ENOENT') { // File does not exist
                console.log("File not found, creating a new 'todo' file.");
                await writeFile('./todo', ''); // Create an empty 'todo' file
                return this.getTodo(); // Call the function again
            } else {
                console.error(`Error reading todo file:`, error);
            }
        }
    }

    async createMarkdownDocument() {
        try {
            const codeMarkdown = await this.generateMarkdown();
            const todos = await this.getTodo();
            const markdown = codeMarkdown + `\n---\n${todos}\n`;
            await fs.writeFile(this.outputFilePath, markdown);
            if (this.verbose) {
                console.log(`Markdown document created at ${this.outputFilePath}`);
                const totalTokens = llama3Tokenizer.encode(markdown).length;
                console.log({total_tokens: totalTokens});
            }
            return { success: true, tokenCount: llama3Tokenizer.encode(markdown).length };
        } catch (error) {
            if (this.verbose) console.error('Error writing markdown document:', error);
            return { success: false, error };
        }
    }

    execCommand(command) {
        try {
            return execSync(command, { cwd: this.dir, encoding: 'utf-8' }).toString().trim();
        } catch (error) {
            if (this.verbose) console.error(`Error executing command: ${command}`, error);
            throw error;
        }
    }
}