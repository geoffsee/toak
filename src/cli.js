#!/usr/bin/env node
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
