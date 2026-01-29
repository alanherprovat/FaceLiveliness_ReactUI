// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,           // allow access via local IP + ngrok-style tunnels
    allowedHosts: ['localhost', '127.0.0.1','172.16.1.81','e081464d539b.ngrok-free.app'],
    // Proxy ALL requests starting with /ws → your FastAPI backend
    proxy: {
      '/ws': {
        target: 'http://localhost:5002',   // your FastAPI server
        ws: true,                          // ← very important: enable WebSocket proxying
        changeOrigin: true,                // helps with headers / virtual hosts
        secure: false,                     // local dev, no HTTPS needed here
      },
    },

    // Keep your HMR settings for ngrok (from previous messages)
    hmr: {
      protocol: 'wss',
      clientPort: 443,
    },
  },
})