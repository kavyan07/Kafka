import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0', // Allow container access
    proxy: {
      '/api': {
        target: 'http://php:8000', // Use container name
        changeOrigin: true,
      }
    }
  }
})
