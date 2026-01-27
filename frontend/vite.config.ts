import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // '/api'로 시작하는 요청은 8080 포트로 토스해라!
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})