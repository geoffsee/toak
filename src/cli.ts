#!/usr/bin/env node
import type { PresetPrompt } from './prompts';

console.log('RUNNING TOKENIZER');
import { MarkdownGenerator, type MarkdownGeneratorOptions } from './MarkdownGenerator';

const args = process.argv.slice(2);
const options: { prompt?: PresetPrompt; } & MarkdownGeneratorOptions = {

};
type ValidArg = keyof MarkdownGeneratorOptions;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') {
    console.log(`${Object.keys(options).map(item => "--" + item).join(', ')}`);
  }
  if (args[i] === '--prompt') {
    options["todoPrompt"] = args[i + 1]
    i++;
  }
  const arg = args[i].replace(/^--/, '');
  if (arg as any satisfies ValidArg) {
      // @ts-ignore - arg can't be used to index options
    options[arg] = args[i + 1]
    i++;
  } else {
    console.log(`Invalid argument specified: ${arg}`);
    console.log(`Possible arguments: ${Object.keys(options).map(item => "--" + item).join(', ')}`);
  }
}

const generator = new MarkdownGenerator(options);
generator
  .createMarkdownDocument()
  .then((result: { success: boolean }) => {
    if (!result.success) {
      process.exit(1);
    }
  })
  .catch((error: any) => {
    console.error('Error:', error);
    process.exit(1);
  });