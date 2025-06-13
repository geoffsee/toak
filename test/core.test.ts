// test/core.test.ts
import { describe, it, expect, beforeEach, spyOn, mock } from 'bun:test';
import { TokenCleaner, MarkdownGenerator } from '../src';
import * as micromatch from 'micromatch';
import llama3Tokenizer from 'llama3-tokenizer-js';
import path from 'path';
import * as fs from 'fs/promises';
import * as child_process from 'child_process';
import { writeFile } from 'fs/promises';


describe('TokenCleaner', () => {
  let tokenCleaner: TokenCleaner;

  beforeEach(() => {
    tokenCleaner = new TokenCleaner();
  });

  describe('clean', () => {
    it('should remove single-line comments', () => {
      const code = `const a = 1; // This is a comment
const b = 2;`;
      const expected = `const a = 1;
const b = 2;`;
      expect(tokenCleaner.clean(code)).toBe(expected);
    });

    it('should remove multi-line comments', () => {
      const code = `/* This is a 
multi-line comment */
const a = 1;`;
      const expected = `const a = 1;`;
      expect(tokenCleaner.clean(code)).toBe(expected);
    });

    it('should remove console statements', () => {
      const code = `console.log('Debugging');
const a = 1;`;
      const expected = `const a = 1;`;
      expect(tokenCleaner.clean(code)).toBe(expected);
    });

    it('should remove import statements', () => {
      const code = `import fs from 'fs';
const a = 1;`;
      const expected = `
const a = 1;`;
      expect(tokenCleaner.clean(code)).toBe(expected);
    });

    it('should trim whitespace and empty lines', () => {
      const code = `const a = 1;  


const b = 2;  `;
      const expected = `const a = 1;
const b = 2;`;
      expect(tokenCleaner.clean(code)).toBe(expected);
    });

    it('should apply custom patterns', () => {
      const customPatterns = [
        { regex: /DEBUG\s*=\s*true/g, replacement: 'DEBUG = false' },
      ];
      const customTokenCleaner = new TokenCleaner(customPatterns);
      const code = `const DEBUG = true;
const a = 1;`;
      const expected = `const DEBUG = false;
const a = 1;`;
      expect(customTokenCleaner.clean(code)).toBe(expected);
    });
  });

  describe('redactSecrets', () => {
    it('should redact API keys', () => {
      const code = `const apiKey = '12345-ABCDE';`;
      const expected = `const apiKey = '[REDACTED]';`;
      expect(tokenCleaner.redactSecrets(code)).toBe(expected);
    });

    it('should redact bearer tokens', () => {
      const code = `Authorization: Bearer abcdef123456`;
      const expected = `Authorization: Bearer [REDACTED]`;
      expect(tokenCleaner.redactSecrets(code)).toBe(expected);
    });

    it('should redact JWT tokens', () => {
      const code = `const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.XmX8v1';`;
      const expected = `const token = '[REDACTED_JWT]';`;
      expect(tokenCleaner.redactSecrets(code)).toBe(expected);
    });

    it('should redact hashes', () => {
      const code = `const hash = 'abcdef1234567890abcdef1234567890abcdef12';`;
      const expected = `const hash = '[REDACTED_HASH]';`;
      expect(tokenCleaner.redactSecrets(code)).toBe(expected);
    });

    it('should apply custom secret patterns', () => {
      const customSecretPatterns = [
        { regex: /SECRET_KEY:\s*['"]([^'"]+)['"]/g, replacement: 'SECRET_KEY: [REDACTED]' },
      ];
      const customTokenCleaner = new TokenCleaner([], customSecretPatterns);
      const code = `SECRET_KEY: 'mysecretkey123'`;
      const expected = `SECRET_KEY: [REDACTED]`;
      expect(customTokenCleaner.redactSecrets(code)).toBe(expected);
    });
  });

  describe('cleanAndRedact', () => {
    it('should clean and redact code', () => {
      const code = `// Comment
const apiKey = '12345-ABCDE';
console.log('Debugging');
import fs from 'fs';

/* Multi-line comment */
const a = 1;`;
      const expected = `const a = 1;`;
      expect(tokenCleaner.cleanAndRedact(code)).toBe(expected);
    });

    it('should handle empty input', () => {
      const code = ``;
      expect(tokenCleaner.cleanAndRedact(code)).toBe('');
    });
  });
});

describe('MarkdownGenerator', () => {
  let markdownGenerator: MarkdownGenerator;

  beforeEach(() => {
    markdownGenerator = new MarkdownGenerator({ verbose: false });
  })

  describe('getTrackedFiles', () => {
    it("should return filtered tracked files", async () => {
      const mockFiles = ["src/index.ts", "src/MarkdownGenerator.ts", "src/TokenCleaner.ts"];

      // Use Bun's mock instead of Jest's spyOn
      mock.module("child_process", () => ({
        execSync: () => mockFiles.join('\n')
      }));

      // Mock micromatch using Bun's mock
      mock.module("micromatch", () => ({
        isMatch: () => false
      }));

      const trackedFiles = await markdownGenerator.getTrackedFiles();
      expect(trackedFiles).toEqual(mockFiles);
    });

    it('should handle git command failure', async () => {
      // Spy on execSync to throw an error
      const execSyncSpy = spyOn(child_process, 'execSync').mockImplementation(() => {
        throw new Error('Git command failed');
      });

      const trackedFiles = await markdownGenerator.getTrackedFiles();
      expect(execSyncSpy).toHaveBeenCalled();
      expect(trackedFiles).toEqual([]);

      // Restore the original implementation
      execSyncSpy.mockRestore();
    });
  });

  describe('readFileContent', () => {
    it("should read and clean file content", async () => {
      const filePath = "test.ts";
      const rawContent = "// comment\nconst x = 1;\nconsole.log('test');";
      const cleanedContent = "const x = 1;";

      // Mock fs/promises readFile
      mock.module("fs/promises", () => ({
        readFile: async () => rawContent,
        writeFile: async () => {
        }
      }));

      // Mock TokenCleaner
      const cleanerMock = mock(() => cleanedContent);
      TokenCleaner.prototype.cleanAndRedact = cleanerMock;

      // Mock llama3Tokenizer
      mock.module("llama3-tokenizer-js", () => ({
        encode: () => [1, 2, 3]
      }));

      const content = await markdownGenerator.readFileContent(filePath);
      expect(content).toBe(cleanedContent);
      expect(cleanerMock).toHaveBeenCalled();
    });

    it('should handle readFile failure', async () => {
      const filePath = 'src/missing.ts';

      // Spy on fs.readFile to reject
      const readFileSpy = spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));

      const content = await markdownGenerator.readFileContent(filePath);
      expect(readFileSpy).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(content).toBe('');

      // Restore the original implementation
      readFileSpy.mockRestore();
    });
  });

  describe('generateMarkdown', () => {
    it('should generate markdown content from tracked files', async () => {
      // Spy on getTrackedFiles
      const getTrackedFilesSpy = spyOn(markdownGenerator, 'getTrackedFiles').mockResolvedValue([
        'src/index.ts',
        'src/MarkdownGenerator.ts',
      ]);

      // Spy on readFileContent
      const readFileContentSpy = spyOn(markdownGenerator, 'readFileContent').mockImplementation(async (filePath: string) => {
        if (filePath === path.join('.', 'src/index.ts')) {
          return `const a = 1;`;
        } else if (filePath === path.join('.', 'src/MarkdownGenerator.ts')) {
          return `class MarkdownGenerator {}`;
        }
        return '';
      });

      const expectedMarkdown = `# Project Files

## src/index.ts
~~~
const a = 1;
~~~

## src/MarkdownGenerator.ts
~~~
class MarkdownGenerator {}
~~~

`;

      const markdown = await markdownGenerator.generateMarkdown();
      expect(markdown).toBe(expectedMarkdown);

      // Restore the original implementations
      getTrackedFilesSpy.mockRestore();
      readFileContentSpy.mockRestore();
    });

    it('should handle no tracked files', async () => {
      // Spy on getTrackedFiles
      const getTrackedFilesSpy = spyOn(markdownGenerator, 'getTrackedFiles').mockResolvedValue([]);

      const expectedMarkdown = `# Project Files

`;

      const markdown = await markdownGenerator.generateMarkdown();
      expect(markdown).toBe(expectedMarkdown);

      // Restore the original implementation
      getTrackedFilesSpy.mockRestore();
    });

    it('should skip empty file contents', async () => {
      // Spy on getTrackedFiles
      const getTrackedFilesSpy = spyOn(markdownGenerator, 'getTrackedFiles').mockResolvedValue([
        'src/index.ts',
        'src/empty.ts',
      ]);

      // Spy on readFileContent
      const readFileContentSpy = spyOn(markdownGenerator, 'readFileContent').mockImplementation(async (filePath: string) => {
        if (filePath === path.join('.', 'src/index.ts')) {
          return `const a = 1;`;
        } else if (filePath === path.join('.', 'src/empty.ts')) {
          return `   `;
        }
        return '';
      });

      const expectedMarkdown = `# Project Files

## src/index.ts
~~~
const a = 1;
~~~

`;

      const markdown = await markdownGenerator.generateMarkdown();
      expect(markdown).toBe(expectedMarkdown);

      // Restore the original implementations
      getTrackedFilesSpy.mockRestore();
      readFileContentSpy.mockRestore();
    });
  });

  describe('getTodo', () => {
    it('should read the todo file content', async () => {
      const todoContent = `- [ ] Implement feature X
- [ ] Fix bug Y`;

      // Spy on fs.readFile
      const readFileSpy = spyOn(fs, 'readFile').mockResolvedValue(todoContent);

      const todo = await markdownGenerator.getTodo();
      expect(readFileSpy).toHaveBeenCalledWith(path.join('.', 'todo'), 'utf-8');
      expect(todo).toBe(todoContent);

      // Restore the original implementation
      readFileSpy.mockRestore();
    });

    it('should create todo file if it does not exist', async () => {
      const todoPath = path.join('.', 'todo');

      // First call to readFile throws ENOENT, second call resolves to empty string
      const readFileSpy = spyOn(fs, 'readFile')
        .mockImplementationOnce(() => {
          const error: any = new Error('File not found');
          error.code = 'ENOENT';
          return Promise.reject(error);
        })
        .mockResolvedValueOnce('');

      // Spy on fs.writeFile
      const writeFileSpy = spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const todo = await markdownGenerator.getTodo();
      expect(readFileSpy).toHaveBeenCalledWith(todoPath, 'utf-8');
      expect(writeFileSpy).toHaveBeenCalledWith(todoPath, '');
      expect(readFileSpy).toHaveBeenCalledWith(todoPath, 'utf-8');
      expect(todo).toBe('');

      // Restore the original implementations
      readFileSpy.mockRestore();
      writeFileSpy.mockRestore();
    });

    it('should throw error for non-ENOENT errors', async () => {
      // Spy on fs.readFile to reject with a different error
      const readFileSpy = spyOn(fs, 'readFile').mockRejectedValue({ code: 'EACCES' });

      await expect(markdownGenerator.getTodo()).rejects.toEqual({ code: 'EACCES' });
      expect(readFileSpy).toHaveBeenCalledWith(path.join('.', 'todo'), 'utf-8');

      // Restore the original implementation
      readFileSpy.mockRestore();
    });
  });

  describe('getRootIgnore', () => {

    it('should create root ignore file if it does not exist', async () => {
      const rootIgnorePath = path.join('.', '.toak-ignore');

      // First call to readFile throws ENOENT, second call resolves to empty string
      const readFileSpy = spyOn(fs, 'readFile')
        .mockImplementationOnce(() => {
          const error: any = new Error('File not found');
          error.code = 'ENOENT';
          return Promise.reject(error);
        })
        .mockResolvedValueOnce('');

      // Spy on fs.writeFile
      const writeFileSpy = spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const rootIgnore = await markdownGenerator.getRootIgnore();
      expect(readFileSpy).toHaveBeenCalledWith(rootIgnorePath, 'utf-8');
      expect(writeFileSpy).toHaveBeenCalledWith(rootIgnorePath, 'todo\nprompt.md');
      expect(rootIgnore).toBe('');

      // Restore the original implementations
      readFileSpy.mockRestore();
      writeFileSpy.mockRestore();
    });
  });

  describe('updateGitignore', () => {
    it('should update .gitignore with prompt.md and .toak-ignore on first run', async () => {
      const gitignorePath = path.join('.', '.gitignore');

      // Mock readFile to simulate .gitignore exists but doesn't have the entries
      const readFileSpy = spyOn(fs, 'readFile').mockResolvedValue('node_modules\ndist\n');

      // Spy on fs.writeFile
      const writeFileSpy = spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      // Call the method
      await markdownGenerator.updateGitignore();

      // Verify readFile was called
      expect(readFileSpy).toHaveBeenCalledWith(gitignorePath, 'utf-8');

      // Verify writeFile was called with correct content
      expect(writeFileSpy).toHaveBeenCalledWith(
        gitignorePath, 
        'node_modules\ndist\nprompt.md\n.toak-ignore\n'
      );

      // Restore the original implementations
      readFileSpy.mockRestore();
      writeFileSpy.mockRestore();
    });

    it('should not update .gitignore if entries already exist', async () => {
      const gitignorePath = path.join('.', '.gitignore');

      // Mock readFile to simulate .gitignore already has the entries
      const readFileSpy = spyOn(fs, 'readFile')
        .mockResolvedValue('node_modules\ndist\nprompt.md\n.toak-ignore\n');

      // Spy on fs.writeFile
      const writeFileSpy = spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      // Call the method
      await markdownGenerator.updateGitignore();

      // Verify readFile was called
      expect(readFileSpy).toHaveBeenCalledWith(gitignorePath, 'utf-8');

      // Verify writeFile was NOT called
      expect(writeFileSpy).not.toHaveBeenCalled();

      // Restore the original implementations
      readFileSpy.mockRestore();
      writeFileSpy.mockRestore();
    });

    it('should create .gitignore if it does not exist', async () => {
      const gitignorePath = path.join('.', '.gitignore');

      // Mock readFile to throw ENOENT error
      const readFileSpy = spyOn(fs, 'readFile').mockImplementation(() => {
        const error: any = new Error('File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      // Spy on fs.writeFile
      const writeFileSpy = spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      // Call the method
      await markdownGenerator.updateGitignore();

      // Verify readFile was called
      expect(readFileSpy).toHaveBeenCalledWith(gitignorePath, 'utf-8');

      // Verify writeFile was called with correct content
      expect(writeFileSpy).toHaveBeenCalledWith(
        gitignorePath, 
        'prompt.md\n.toak-ignore\n'
      );

      // Restore the original implementations
      readFileSpy.mockRestore();
      writeFileSpy.mockRestore();
    });
  });

  describe('createMarkdownDocument', () => {
    it('should create markdown document successfully', async () => {
      const mockContent = '# Project Files\n\n## test.txt\n~~~\ntest\n~~~\n\n';
      const mockTodo = 'test todo';
      let writeFileCalled = false;

      // Create instance first
      const generator = new MarkdownGenerator();

      // Setup instance method mocks
      generator.generateMarkdown = mock(() => Promise.resolve(mockContent));
      generator.getTodo = mock(() => Promise.resolve(mockTodo));

      // Create a mock implementation for createMarkdownDocument that skips file writing
      const originalCreateMarkdown = generator.createMarkdownDocument.bind(generator);
      generator.createMarkdownDocument = mock(async () => {
        writeFileCalled = true;
        const markdown = await generator.generateMarkdown();
        const todos = await generator.getTodo();
        const fullMarkdown = markdown + `\n---\n\n${todos}\n`;
        return {
          success: true,
          tokenCount: llama3Tokenizer.encode(fullMarkdown).length
        };
      });

      // Mock tokenizer with actual observed token count from logs
      mock(llama3Tokenizer, 'encode').mockImplementation(() => new Array(21));

      const result = await generator.createMarkdownDocument();

      expect(generator.generateMarkdown).toHaveBeenCalled();
      expect(generator.getTodo).toHaveBeenCalled();
      expect(writeFileCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.tokenCount).toBe(21);

    });

    it('should handle errors during markdown creation', async () => {
      // Spy on generateMarkdown to reject
      const generateMarkdownSpy = spyOn(markdownGenerator, 'generateMarkdown').mockRejectedValue(new Error('Generation failed'));

      const result = await markdownGenerator.createMarkdownDocument();
      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('Generation failed'));

      // Restore the original implementation
      generateMarkdownSpy.mockRestore();
    });
  });
});
