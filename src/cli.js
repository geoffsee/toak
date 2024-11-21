#!/usr/bin/env node
console.log("RUNNING TOKENIZER")
import { MarkdownGenerator } from './MarkdownGenerator.js';

const generator = new MarkdownGenerator();
generator
  .createMarkdownDocument()
  .then(result => {
    if (!result.success) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
