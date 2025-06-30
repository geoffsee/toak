import path from 'path';
import { execSync } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import llama3Tokenizer from 'llama3-tokenizer-js';
import { TokenCleaner } from './TokenCleaner.js';
import * as micromatch from 'micromatch';
import fileTypeExclusions from './fileTypeExclusions.js';
import fileExclusions from './fileExclusions.js';
import { readFileSync } from 'node:fs';
import { glob } from 'glob';
import { isPreset, type PresetPrompt, prompts } from './prompts.ts';


export interface MarkdownGeneratorOptions {
  dir?: string;
  outputFilePath?: string;
  fileTypeExclusions?: Set<string>;
  fileExclusions?: string[];
  customPatterns?: Record<string, any>;
  customSecretPatterns?: Record<string, any>;
  verbose?: boolean;
  todoPrompt?: string
}

/**
 * @class MarkdownGenerator
 * @description A class that generates markdown documentation from tracked Git files in a project.
 * It can exclude specific file types and files, clean tokens, and include todo lists.
 */
export class MarkdownGenerator {
  private dir: string;
  private outputFilePath: string;
  private fileTypeExclusions: Set<string>;
  private fileExclusions: string[];
  private tokenCleaner: TokenCleaner;
  private verbose: boolean;
  private initialized: boolean;
  private todoPrompt: string;

  /**
   * Creates an instance of MarkdownGenerator.
   * @param {MarkdownGeneratorOptions} [options={}] - Configuration options for the generator
   */
  constructor(options: MarkdownGeneratorOptions = {}) {
    this.dir = options.dir || '.';
    this.outputFilePath = options.outputFilePath || './prompt.md';
    this.fileTypeExclusions = new Set(
      options.fileTypeExclusions || fileTypeExclusions,
    );
    this.fileExclusions = options.fileExclusions || [...fileExclusions];
    // @ts-ignore - options.customPatterns signature is valid
    this.tokenCleaner = new TokenCleaner(options.customPatterns, options.customSecretPatterns);
    this.verbose = options.verbose !== undefined ? options.verbose : true;
    this.initialized = false;
    this.todoPrompt = prompts.getPrompt(options.todoPrompt)
  }

  /**
   * Initializes the MarkdownGenerator by loading all nested ignore files.
   * This is automatically called before any file processing operations.
   * @async
   * @returns {Promise<void>}
   */
  private async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.loadNestedIgnoreFiles();
      await this.updateGitignore();
      this.initialized = true;
    }
  }

  /**
   * Loads and processes .toak-ignore files recursively from the project directory.
   * These files contain patterns for files to exclude from processing.
   * @async
   * @returns {Promise<void>}
   * @throws {Error} When unable to read ignore files
   */
  async loadNestedIgnoreFiles(): Promise<void> {
    try {
      if (this.verbose) {
        console.log('Loading ignore patterns...');
      }

      const ignoreFiles = await glob('**/.toak-ignore', {
        cwd: this.dir,
        dot: true,
        absolute: true,
        follow: false,
        nodir: true
      });

      if (this.verbose) {
        console.log(`Found ${ignoreFiles.length} ignore files`);
      }

      // Process each ignore file
      for (const ignoreFile of ignoreFiles) {
        try {
          const content = readFileSync(ignoreFile, 'utf-8');
          const patterns = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

          // Get relative patterns based on ignore file location
          const ignoreFileDir = path.relative(this.dir, path.dirname(ignoreFile));
          const relativePatterns = patterns.map(pattern => {
            if (!pattern.startsWith('/') && !pattern.startsWith('**')) {
              return path.join(ignoreFileDir, pattern).replace(/\\/g, '/');
            }
            return pattern;
          });

          this.fileExclusions.push(...relativePatterns);
        } catch (error) {
          if (this.verbose) {
            console.error(`Error processing ignore file ${ignoreFile}:`, error);
          }
        }
      }

      // Remove duplicates
      this.fileExclusions = [...new Set(this.fileExclusions)];

      if (this.verbose) {
        console.log(`Total exclusion patterns: ${this.fileExclusions.length}`);
      }
    } catch (error) {
      if (this.verbose) {
        console.error('Error loading nested ignore files:', error);
      }
      throw error;
    }
  }

  /**
   * Retrieves a list of files tracked by Git, excluding those specified in fileTypeExclusions and fileExclusions.
   * @async
   * @returns {Promise<string[]>} Array of tracked file paths that aren't excluded
   * @throws {Error} When unable to execute git command or access files
   */
  async getTrackedFiles(): Promise<string[]> {
    await this.initialize();
    try {
      const output = this.execCommand('git ls-files');
      const trackedFiles = output.split('\n').filter(file => file.trim().length > 0);
      if (this.verbose) {
        console.log(`Total tracked files: ${trackedFiles.length}`);
      }
      const filteredFiles = trackedFiles.filter(file => {
        const fileExt = path.extname(file).toLowerCase();
        return !this.fileTypeExclusions.has(fileExt) && !micromatch.isMatch(file, this.fileExclusions, { dot: true });
      });
      if (this.verbose) {
        const excludedCount = trackedFiles.length - filteredFiles.length;
        console.log(`Excluded files: ${excludedCount}`);
        console.log(`Files to process after exclusions: ${filteredFiles.length}`);
      }
      return filteredFiles;
    } catch (error) {
      if (this.verbose) {
        console.error('Error fetching tracked files:', error);
      }
      return [];
    }
  }

  /**
   * Reads and processes the content of a file, cleaning and redacting sensitive information.
   * @async
   * @param {string} filePath - Path to the file to read
   * @returns {Promise<string>} Cleaned and redacted content of the file
   * @throws {Error} When unable to read or process the file
   */
  async readFileContent(filePath: string): Promise<string> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const cleanedAndRedactedContent = this.tokenCleaner.cleanAndRedact(content);
      if (this.verbose) {
        const tokenCount = llama3Tokenizer.encode(cleanedAndRedactedContent).length;
        console.log(`${filePath}: Tokens[${tokenCount}]`);
      }
      return  cleanedAndRedactedContent.trimEnd();
    } catch (error) {
      if (this.verbose) {
        console.error(`Error reading file ${filePath}:`, error);
      }
      return '';
    }
  }

  /**
   * Generates markdown content from all tracked files in the project.
   * @async
   * @returns {Promise<string>} Generated markdown content containing all processed files
   * @throws {Error} When unable to generate markdown content
   */
  async generateMarkdown(): Promise<string> {
    const trackedFiles = await this.getTrackedFiles();
    if (this.verbose) {
      console.log(`Generating markdown for ${trackedFiles.length} files`);
    }
    let markdownContent = '# Project Files\n\n';

    for (const file of trackedFiles) {
      const absolutePath = path.join(this.dir, file);
      const content = await this.readFileContent(absolutePath);
      if (content.trim()) { // Only include files with content after cleaning
        markdownContent += `## ${file}\n~~~\n${content.trim()}\n~~~\n\n`;
      } else if (this.verbose) {
        console.log(`Skipping ${file} as it has no content after cleaning.`);
      }
    }
    return markdownContent;
  }

  /**
   * Retrieves the content of the project's todo file, creating it if it doesn't exist.
   * @async
   * @returns {Promise<string>} Content of the todo file
   * @throws {Error} When unable to read or create the todo file
   */
  async getTodo(): Promise<string> {
    const todoPath = path.join(this.dir, 'todo');
    try {
      if (this.verbose) {
        console.log('Reading todo file');
      }
      return await readFile(todoPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File does not exist
        if (this.verbose) {
          console.log('File not found, creating a new \'todo\' file.');
        }
        await writeFile(todoPath, ''); // Create an empty 'todo' file
        return await this.getTodo(); // Await the recursive call
      }
      if (this.verbose) {
        console.error('Error reading todo file:', error);
      }
      throw error;
    }
  }

  async getRootIgnore(): Promise<string> {
    const rootIgnorePath = path.join(this.dir, '.toak-ignore');
    try {
      return await readFile(rootIgnorePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File does not exist
        if (this.verbose) {
          console.log('File not found, creating a root \'.toak-ignore\' file.');
        }
        await writeFile(rootIgnorePath, 'todo\nprompt.md'); // Create an empty 'todo' file
        return await this.getRootIgnore(); // Await the recursive call
      }
      throw error;
    }
  }

  async updateGitignore(): Promise<void> {
    const gitignorePath = path.join(this.dir, '.gitignore');
    try {
      let content = '';
      try {
        content = await readFile(gitignorePath, 'utf-8');
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // .gitignore doesn't exist, create it
          if (this.verbose) {
            console.log('File not found, creating a \'.gitignore\' file.');
          }
          content = '';
        } else {
          throw error;
        }
      }

      // Check if entries already exist
      const lines = content.split('\n');
      const needsPromptMd = !lines.some(line => line.trim() === 'prompt.md');
      const needsToakIgnore = !lines.some(line => line.trim() === '.toak-ignore');

      // Add entries if needed
      if (needsPromptMd || needsToakIgnore) {
        if (this.verbose) {
          console.log('Updating .gitignore with prompt.md and .toak-ignore');
        }

        let newContent = content;
        if (newContent && !newContent.endsWith('\n')) {
          newContent += '\n';
        }

        if (needsPromptMd) {
          newContent += 'prompt.md\n';
        }

        if (needsToakIgnore) {
          newContent += '.toak-ignore\n';
        }

        await writeFile(gitignorePath, newContent);
      }
    } catch (error) {
      if (this.verbose) {
        console.error('Error updating .gitignore:', error);
      }
      throw error;
    }
  }

  /**
   * Creates a complete markdown document combining code documentation and todos.
   * @async
   * @returns {Promise<Object>} Result object
   * @returns {boolean} result.success - Whether the operation was successful
   * @returns {number} [result.tokenCount] - Number of tokens in the generated document
   * @returns {Error} [result.error] - Error object if operation failed
   * @throws {Error} When unable to create or write the markdown document
   */
  async createMarkdownDocument(): Promise<{ success: boolean, tokenCount?: number, error?: Error }> {
    try {
      const codeMarkdown = await this.generateMarkdown();
      const todos = await this.getTodo();
      const _ = await this.getRootIgnore();
      const markdown = codeMarkdown + `\n---\n\n${todos}\n`;
      await writeFile(this.outputFilePath, markdown);
      if (this.verbose) {
        console.log(`Markdown document created at ${this.outputFilePath}`);
        const totalTokens = llama3Tokenizer.encode(markdown).length;
        console.log({ total_tokens: totalTokens });
      }
      return { success: true, tokenCount: llama3Tokenizer.encode(markdown).length };
    } catch (error: any) {
      if (this.verbose) {
        console.error('Error writing markdown document:', error);
      }
      return { success: false, error };
    }
  }

  /**
   * Executes a shell command in the specified directory.
   * @param {string} command - Shell command to execute
   * @returns {string} Output of the command
   * @throws {Error} When command execution fails
   * @private
   */
  private execCommand(command: string): string {
    try {
      return execSync(command, { cwd: this.dir, encoding: 'utf-8' }).toString().trim();
    } catch (error) {
      if (this.verbose) {
        console.error(`Error executing command: ${command}`, error);
      }
      throw error;
    }
  }
}
