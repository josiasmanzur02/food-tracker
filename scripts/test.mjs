import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const output = await mkdtemp(join(tmpdir(), 'calorietrack-tests-'));
try {
  await build({
    configFile: false,
    logLevel: 'error',
    define: { 'import.meta.env.VITE_USDA_FOOD_SEARCH_API_URL': '""' },
    build: {
      outDir: output,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: 'tests/core.test.ts',
        formats: ['es'],
        fileName: () => 'core.test.mjs'
      },
      rollupOptions: { external: [/^node:/] }
    }
  });
  const result = spawnSync(
    process.execPath,
    ['--test', join(output, 'core.test.mjs')],
    { stdio: 'inherit' }
  );
  process.exitCode = result.status ?? 1;
} finally {
  await rm(output, { recursive: true, force: true });
}
