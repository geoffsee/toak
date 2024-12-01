import isolatedDecl from 'bun-plugin-isolated-decl';

// handles building the library
await Bun.build({
  entrypoints: ['./src/*.ts'],
  outdir: './dist',
  target: 'node',
  plugins: [
    isolatedDecl({
      forceGenerate: true,  // Generate declaration files even if there are errors
    })
  ],
});
