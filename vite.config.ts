import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules/@sentry')) return 'monitoring';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-router-dom')) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
});
