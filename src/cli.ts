#!/usr/bin/env node
console.log('RUNNING TOKENIZER');
import { MarkdownGenerator } from './MarkdownGenerator.js';

const generator = new MarkdownGenerator();
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