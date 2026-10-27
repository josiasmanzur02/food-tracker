import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';

// Classic scripts work from WKWebView's local file origin without a server.
await build({
  base: './',
  build: {
    outDir: 'ios/CalorieTrack/web',
    emptyOutDir: true,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true, name: 'CalorieTrack' } }
  }
});
const index = 'ios/CalorieTrack/web/index.html';
const html = await readFile(index, 'utf8');
await writeFile(index, html.replace(/type="module"/g, 'defer').replace(/ crossorigin/g, ''));
