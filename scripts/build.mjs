import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('lib', {recursive: true});
await build({entryPoints: ['src/index.js'], bundle: true, outfile: 'lib/index.js', format: 'esm', platform: 'node', target: 'node22', legalComments: 'none'});
const result = await build({entryPoints: ['src/client.jsx'], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'chrome130', external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'], jsx: 'transform', minify: true, legalComments: 'none', loader: {'.css': 'text'}});
await writeFile('lib/client.js', `window.__ModuleLoader__.load({id:"@deepseekharness-plugin/dsh-codex-picker",factory:(require)=>{const module={exports:{}};const exports=module.exports;${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
