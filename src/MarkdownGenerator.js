// MarkdownGenerator.js

import path from 'path';
import { execSync } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import llama3Tokenizer from 'llama3-tokenizer-js';
import { TokenCleaner } from './TokenCleaner.js';
import micromatch from 'micromatch';

/**
 * @typedef {Object} MarkdownGeneratorOptions
 * @property {string} [dir='.'] - The directory to process files from
 * @property {string} [outputFilePath='./prompt.md'] - Path where the output markdown file will be saved
 * @property {Set<string>} [fileTypeExclusions] - Set of file extensions to exclude
 * @property {string[]} [fileExclusions] - Array of specific files or patterns to exclude
 * @property {Object} [customPatterns] - Custom patterns for token cleaning
 * @property {Object} [customSecretPatterns] - Custom patterns for identifying and redacting secrets
 * @property {boolean} [verbose=true] - Whether to log detailed information during processing
 */

/**
 * @class MarkdownGenerator
 * @description A class that generates markdown documentation from tracked Git files in a project.
 * It can exclude specific file types and files, clean tokens, and include todo lists.
 */
export class MarkdownGenerator {
  /**
   * Creates an instance of MarkdownGenerator.
   * @param {MarkdownGeneratorOptions} [options={}] - Configuration options for the generator
   */
  constructor(options = {}) {
    this.dir = options.dir || '.';
    this.outputFilePath = options.outputFilePath || './prompt.md';

    this.fileTypeExclusions = new Set(
      options.fileTypeExclusions || [
        // Images
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.bmp',
        '.svg',
        '.webp',
        '.tiff',
        '.ico',

        // Fonts
        '.ttf',
        '.woff',
        '.woff2',
        '.eot',
        '.otf',

        // Lock files
        '.lock',
        '.lockb',

        // Config files
        '.yaml',
        '.yml',
        '.toml',
        '.conf',

        // Binary and compiled
        '.exe',
        '.dll',
        '.so',
        '.dylib',
        '.bin',
        '.dat',
        '.pyc',
        '.pyo',
        '.class',
        '.jar',

        // Archives
        '.zip',
        '.tar',
        '.gz',
        '.rar',
        '.7z',

        // Media
        '.mp3',
        '.mp4',
        '.avi',
        '.mov',
        '.wav',

        // Database
        '.db',
        '.sqlite',
        '.sqlite3'
      ]
    );

    this.fileExclusions = options.fileExclusions || [
      // Config patterns
      '**/.*rc',
      '**/.*rc.{js,json,yaml,yml}',
      '**/*.config.{js,ts}',
      '**/tsconfig.json',
      '**/tsconfig*.json',
      '**/jsconfig.json',
      '**/jsconfig*.json',
      '**/package-lock.json',
      '**/.prettierignore',
      // Environment and variables
      '**/.env*',
      '**/*.vars',
      '**/secrets.*',

      // Version control
      '**/.git*',
      '**/.hg*',
      '**/.svn*',
      '**/CVS',
      '**/.github/',

      // CI/CD
      '**/.gitlab-ci.yml',
      '**/azure-pipelines.yml',
      '**/jenkins*',

      // Dependency directories
      '**/node_modules/',
      '**/target/',
      '**/__pycache__/',
      '**/venv/',
      '**/.venv/',
      '**/env/',
      '**/build/',
      '**/dist/',
      '**/out/',
      '**/bin/',
      '**/obj/',

      // Documentation
      '**/README*',
      '**/CHANGELOG*',
      '**/CONTRIBUTING*',
      '**/LICENSE*',
      '**/docs/',
      '**/documentation/',

      // IDE and editors
      '**/.{idea,vscode,eclipse,settings,zed,cursor}/',
      '**/.project',
      '**/.classpath',
      '**/.factorypath',

      // Test and data
      '**/test{s,}/',
      '**/spec/',
      '**/fixtures/',
      '**/testdata/',
      '**/__tests__/',
      '**/*.{test,spec}.*',
      '**/coverage/',
      '**/jest.config.*',

      // Logs and temporary files
      '**/logs/',
      '**/tmp/',
      '**/temp/',
      '**/*.log'
    ];

    this.tokenCleaner = new TokenCleaner(options.customPatterns, options.customSecretPatterns);
    this.verbose = options.verbose !== undefined ? options.verbose : true;
  }

  /**
   * Retrieves a list of files tracked by Git, excluding those specified in fileTypeExclusions and fileExclusions.
   * @async
   * @returns {Promise<string[]>} Array of tracked file paths that aren't excluded
   * @throws {Error} When unable to execute git command or access files
   */
  async getTrackedFiles() {
    try {
      const output = this.execCommand('git ls-files');
      const trackedFiles = output.split('\n').filter(file => file.trim().length > 0);
      if (this.verbose) {
        console.log(`Total tracked files: ${trackedFiles.length}`);
      }
      // Use micromatch to filter out excluded files
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
  async readFileContent(filePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const cleanedAndRedactedContent = this.tokenCleaner.cleanAndRedact(content);
      if (this.verbose) {
        const tokenCount = llama3Tokenizer.encode(cleanedAndRedactedContent).length;
        console.log(`${filePath}: Tokens[${tokenCount}]`);
      }
      return cleanedAndRedactedContent;
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
  async generateMarkdown() {
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
  async getTodo() {
    const todoPath = path.join(this.dir, 'todo');
    try {
      if (this.verbose) {
        console.log('Reading todo file');
      }
      return await readFile(todoPath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File does not exist
        if (this.verbose) {
          console.log("File not found, creating a new 'todo' file.");
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

  /**
   * Creates a complete markdown document combining code documentation and todos.
   * @async
   * @returns {Promise<Object>} Result object
   * @returns {boolean} result.success - Whether the operation was successful
   * @returns {number} [result.tokenCount] - Number of tokens in the generated document
   * @returns {Error} [result.error] - Error object if operation failed
   * @throws {Error} When unable to create or write the markdown document
   */
  async createMarkdownDocument() {
    try {
      const codeMarkdown = await this.generateMarkdown();
      const todos = await this.getTodo();
      const markdown = codeMarkdown + `\n---\n\n${todos}\n`;
      await writeFile(this.outputFilePath, markdown);
      if (this.verbose) {
        console.log(`Markdown document created at ${this.outputFilePath}`);
        const totalTokens = llama3Tokenizer.encode(markdown).length;
        console.log({ total_tokens: totalTokens });
      }
      return { success: true, tokenCount: llama3Tokenizer.encode(markdown).length };
    } catch (error) {
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
  execCommand(command) {
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
