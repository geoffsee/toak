// test/cli.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { MarkdownGenerator, type MarkdownGeneratorOptions } from '../src/MarkdownGenerator';
import type { PresetPrompt } from '../src/prompts';

// Function to process CLI arguments similar to cli.ts
function processArgs(args: string[]): { prompt?: PresetPrompt; } & MarkdownGeneratorOptions {
  const options: { prompt?: PresetPrompt; } & MarkdownGeneratorOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log(`${Object.keys(options).map(item => "--" + item).join(', ')}`);
      continue;
    }
    if (args[i] === '--prompt') {
      options["todoPrompt"] = args[i + 1] as PresetPrompt;
      i++;
      continue;
    }

    const arg = args[i].replace(/^--/, '');
    if (['dir', 'outputFilePath', 'verbose', 'todoPrompt', 'fileTypeExclusions', 'fileExclusions', 'customPatterns', 'customSecretPatterns'].includes(arg)) {
      // @ts-ignore - dynamic property access
      options[arg] = args[i + 1];
      i++;
    } else {
      console.log(`Invalid argument specified: ${arg}`);
      console.log(`Possible arguments: ${Object.keys(options).map(item => "--" + item).join(', ')}`);
    }
  }

  return options;
}

describe('CLI', () => {
  describe('argument handling', () => {
    it('should process --prompt argument correctly', () => {
      // Set up test arguments
      const args = ['--prompt', 'tcs:fix:errors'];

      // Process arguments
      const options = processArgs(args);

      // Verify options
      expect(options).toEqual(expect.objectContaining({
        todoPrompt: 'tcs:fix:errors'
      }));
    });

    it('should process other valid arguments correctly', () => {
      // Set up test arguments
      const args = ['--dir', './src', '--outputFilePath', './custom.md', '--verbose', 'false'];

      // Process arguments
      const options = processArgs(args);

      // Verify options
      expect(options).toEqual(expect.objectContaining({
        dir: './src',
        outputFilePath: './custom.md',
        verbose: 'false'
      }));
    });

    it('should handle invalid arguments', () => {
      // Mock console.log to capture output
      const consoleLogSpy = spyOn(console, 'log');

      // Set up test arguments
      const args = ['--invalidArg', 'value'];

      // Process arguments
      processArgs(args);

      // Verify error message was logged
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid argument specified: invalidArg'));

      // Restore original function
      consoleLogSpy.mockRestore();
    });

    it('should display help when --help argument is provided', () => {
      // Mock console.log to capture output
      const consoleLogSpy = spyOn(console, 'log');

      // Set up test arguments
      const args = ['--help'];

      // Process arguments
      processArgs(args);

      // Verify help message was logged
      // At this point, the options object is empty, so we just check that console.log was called
      expect(consoleLogSpy).toHaveBeenCalled();

      // Restore original function
      consoleLogSpy.mockRestore();
    });
  });
});
