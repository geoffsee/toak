import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import { readFile, writeFile } from 'fs/promises';
import llama3Tokenizer from 'llama3-tokenizer-js';
import { TokenCleaner } from './TokenCleaner.js';

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
   * @param {Object} [options={}] - Configuration options for the generator
   * @param {string} [options.dir='.'] - The directory to process files from
   * @param {string} [options.outputFilePath='./prompt.md'] - Path where the output markdown file will be saved
   * @param {Set<string>} [options.fileTypeExclusions] - Set of file extensions to exclude (defaults to common image and asset files)
   * @param {string[]} [options.fileExclusions] - Array of specific files or patterns to exclude
   * @param {Object} [options.customPatterns] - Custom patterns for token cleaning
   * @param {Object} [options.customSecretPatterns] - Custom patterns for identifying and redacting secrets
   * @param {boolean} [options.verbose=true] - Whether to log detailed information during processing
   */
  constructor(options = {}) {
    this.dir = options.dir || '.';
    this.outputFilePath = options.outputFilePath || './prompt.md';
    this.fileTypeExclusions = new Set(
      options.fileTypeExclusions || [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.bmp',
        '.svg',
        '.webp',
        '.tiff',
        '.lockb',
        '.yaml',
        '.ico',
        '.ttf',
        '.woff2',
        'woff'
      ],
    );
    this.fileExclusions = options.fileExclusions || [
      'prompt.js',
      '.gitignore',
      '.env',
      '.dev.vars',
    ];
    this.tokenCleaner = new TokenCleaner(options.customPatterns, options.customSecretPatterns);
    this.verbose = options.verbose ?? true;
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
      const trackedFiles = output.split('\n').filter(file => file.length > 0);
      if (this.verbose) {
        console.log(`Total tracked files: ${trackedFiles.length}`);
      }
      return trackedFiles.filter(file => {
        const fileExt = path.extname(file).toLowerCase();
        const isExcluded = this.fileExclusions.some(pattern => this.isFileExcluded(file, pattern));
        return !this.fileTypeExclusions.has(fileExt) && !isExcluded;
      });
    } catch (error) {
      if (this.verbose) {
        console.error('Error fetching tracked files:', error);
      }
      return [];
    }
  }
  /**
   * Determines if a file should be excluded based on the given pattern.
   * @param {string} filePath - Path of the file to check
   * @param {string} pattern - Exclusion pattern to match against
   * @returns {boolean} True if the file should be excluded, false otherwise
   * @example
   * // Excludes all files in a directory
   * isFileExcluded('src/tests/file.js', 'src/tests/*') // returns true
   * // Excludes specific file extensions in a directory
   * isFileExcluded('src/assets/image.png', 'src/assets/*.png') // returns true
   */
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
  /**
   * Reads and processes the content of a file, cleaning and redacting sensitive information.
   * @async
   * @param {string} filePath - Path to the file to read
   * @returns {Promise<string>} Cleaned and redacted content of the file
   * @throws {Error} When unable to read or process the file
   */
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
      const content = await this.readFileContent(path.join(this.dir, file));
      markdownContent += `## ${file}\n~~~\n${content.trim()}\n~~~\n`;
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
    try {
      console.log('Reading todo file');
      return await readFile('./todo', 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File does not exist
        console.log("File not found, creating a new 'todo' file.");
        await writeFile('./todo', ''); // Create an empty 'todo' file
        return this.getTodo(); // Call the function again
      }
      console.error('Error reading todo file:', error);
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
      const markdown = codeMarkdown + `\n---\n${todos}\n`;
      await fs.writeFile(this.outputFilePath, markdown);
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
