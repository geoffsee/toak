// handles building the library
await Bun.build({
  entrypoints: [
    "src/cli.ts",
    "src/fileExclusions.ts",
    "src/fileTypeExclusions.ts",
    "src/index.ts",
    "src/MarkdownGenerator.ts",
    "src/TokenCleaner.ts"
  ],
  outdir: './dist',
  minify: true,
  target: 'node',
  splitting: true
});
