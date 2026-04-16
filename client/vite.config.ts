import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  envDir: '../',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
    // When running behind the cloudflared HTTPS tunnel, HMR must use port 443.
    // Set VITE_TUNNEL=true in your shell before starting the dev server:
    //   VITE_TUNNEL=true npm run dev
    hmr: process.env.VITE_TUNNEL ? { clientPort: 443 } : true,
    allowedHosts: true,
  },
});