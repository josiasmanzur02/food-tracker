import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();

  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const withoutLeading = trimmed.replace(/^\/+/, '');
  const withLeading = `/${withoutLeading}`;

  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function getBasePath(): string {
  const envBasePath = process.env.VITE_BASE_PATH;

  if (envBasePath) {
    return normalizeBasePath(envBasePath);
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];

  if (process.env.GITHUB_ACTIONS === 'true' && repositoryName) {
    return normalizeBasePath(repositoryName);
  }

  return '/';
}

export default defineConfig({
  base: getBasePath(),
  plugins: [react()],
  build: {
    sourcemap: false
  }
});
