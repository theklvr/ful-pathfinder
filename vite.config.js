import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // maplibre-gl ships an internal worker file that Vite's esbuild-based
  // dep optimizer mishandles during pre-bundling; exclude it so it's
  // loaded as-is instead.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
