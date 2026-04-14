import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // pdfjs-dist ships its own worker and uses dynamic imports internally.
    // Excluding it from Vite's pre-bundler prevents esbuild from mangling
    // those internals and breaking the worker setup.
    exclude: ['pdfjs-dist'],
  },
})
