import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
