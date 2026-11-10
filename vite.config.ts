import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ['**/.tools/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } } },
  },
});
