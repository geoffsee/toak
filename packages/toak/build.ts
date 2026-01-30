// handles building the library

// inject version into build
const pkg = await Bun.file("./package.json").json() as { version?: string; name?: string };
const version = pkg.version ?? "0.0.0";

await Bun.build({
  entrypoints: [
    "src/cli.ts",
    "src/fileExclusions.ts",
    "src/fileTypeExclusions.ts",
    "src/index.ts",
    "src/MarkdownGenerator.ts",
    "src/TokenCleaner.ts",
  ],
  outdir: "./dist",
  minify: true,
  target: "node",
  splitting: true,
  define: {
    __VERSION__: JSON.stringify(version),
  },
});