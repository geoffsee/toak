import isolatedDecl from 'bun-plugin-isolated-decl';

await Bun.build({
  entrypoints: ['./src/cli.ts', './src/index.ts'],
  outdir: './dist',
  target: 'node',
  plugins: [
    isolatedDecl({
      forceGenerate: true,  // Generate declaration files even if there are errors
    })
  ],
});
