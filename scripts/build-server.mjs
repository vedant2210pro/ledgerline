import { build } from 'esbuild';
import { fileURLToPath, URL } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['server/src/runtime.ts'],
  outfile: 'server/dist/runtime.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  alias: { '@ledgerline/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  metafile: true,
  logLevel: 'info',
});

// The deployed entry must not depend on source TypeScript or a TS workspace export.
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports) {
    assert(!/\.tsx?$/.test(dependency.path), 'Uncompiled TypeScript in backend output');
    assert(!dependency.path.startsWith('@ledgerline/'), 'Unbundled workspace dependency');
  }
}
