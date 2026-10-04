import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { guidePagesPlugin } from './build/guidePages';

export default defineConfig({
  plugins: [react(), guidePagesPlugin()],
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    // Was true. That shipped a 1.7MB .js.map plus a sourceMappingURL comment,
    // publishing fully readable source to anyone who opened devtools.
    sourcemap: false,
  },
});
