import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => ({
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'vendor-monaco';
            if (id.includes('@codesandbox')) return 'vendor-sandpack';
            if (id.includes('@xyflow')) return 'vendor-xyflow';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('highlight.js')) return 'vendor-highlight';
            if (id.includes('react-markdown') || id.includes('micromark') || id.includes('mdast')) {
              return 'vendor-markdown';
            }
            if (id.includes('/react-dom/') || id.includes('\\react-dom\\')) return 'vendor-react-dom';
            if (id.includes('/react/') || id.includes('\\react\\')) return 'vendor-react';
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('axios')) return 'vendor-axios';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
}));
