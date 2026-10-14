import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'

// Harness loads lazy CommonJS factories through its shared browser module table.
// React and UI primitives must retain their host-provided identities.
const { outputFiles } = await build({
  entryPoints: ['src/client/index.tsx'], bundle: true, platform: 'browser', format: 'cjs',
  target: 'es2022', write: false, jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
})
await writeFile('dist/client.js', `window.__ModuleLoader__.load({
  id: 'deepseek-harness-brave-search',
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
${outputFiles[0].text}
    return module.exports;
  }
});\n`)
