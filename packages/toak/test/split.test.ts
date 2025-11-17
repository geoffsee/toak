import { describe, it, expect, spyOn, mock } from 'bun:test';
import { MarkdownGenerator } from '../src';
import path from 'path';

describe('MarkdownGenerator.splitByTokens', () => {
  it('returns one chunk when file fits within token budget', async () => {
    const gen = new MarkdownGenerator({ verbose: false });

    // Mock tracked files
    const getTrackedFilesSpy = spyOn(gen, 'getTrackedFiles').mockResolvedValue(['src/a.ts']);

    // Mock readFileContent
    const readFileContentSpy = spyOn(gen, 'readFileContent').mockImplementation(
      async (filePath: string) => {
        if (filePath === path.join('.', 'src/a.ts')) {
          return `const a = 1;\nconst b = 2;`;
        }
        return '';
      }
    );

    const chunks = await gen.splitByTokens(50);
    expect(chunks.length).toBe(1);
    expect(chunks[0].fileName).toBe('src/a.ts');
    expect(chunks[0].content).toContain('## src/a.ts');
    expect(chunks[0].content).toContain('~~~');
    expect(chunks[0].content).toContain('const a = 1;');

    getTrackedFilesSpy.mockRestore();
    readFileContentSpy.mockRestore();
  });

  it('splits a file into multiple chunks when budget is small', async () => {
    const gen = new MarkdownGenerator({ verbose: false });

    // Mock tracked files
    const getTrackedFilesSpy = spyOn(gen, 'getTrackedFiles').mockResolvedValue(['src/a.ts']);

    // Mock readFileContent with 3 lines
    const readFileContentSpy = spyOn(gen, 'readFileContent').mockImplementation(
      async (filePath: string) => {
        if (filePath === path.join('.', 'src/a.ts')) {
          return `line1\nline2\nline3`;
        }
        return '';
      }
    );

    // With gpt-tokenizer:
    // - Header: 7 tokens
    // - Footer: 3 tokens
    // - Each line: 2 tokens
    // - Two lines: 5 tokens
    // With maxTokens = 13, contentBudget = 3, so only 1 line fits per chunk
    const chunks = await gen.splitByTokens(13);

    expect(chunks.length).toBe(3);
    expect(chunks[0].fileName).toBe('src/a.ts');
    expect(chunks[0].content).toContain('## src/a.ts');
    expect(chunks[0].content).toContain('~~~');
    expect(chunks[0].content).toContain('line1');
    expect(chunks[1].content).toContain('line2');
    expect(chunks[2].content).toContain('line3');

    // meta should have chunkCount populated
    for (const c of chunks) {
      expect(c.meta.chunkCount).toBe(3);
      expect(typeof c.meta.chunkIndex).toBe('number');
    }

    getTrackedFilesSpy.mockRestore();
    readFileContentSpy.mockRestore();
  });
});
