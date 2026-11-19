import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const assetVersion = Date.now().toString(36)

  return {
    plugins: [
      react(),
      {
        name: 'xeinty-entry-version',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            return html.replace(/(["'])([^"']*\/assets\/index\.(?:js|css))\1/g,
              (_match, quote, asset) => quote + asset + '?v=' + assetVersion + quote)
          },
        },
      },
    ],
    base: env.VITE_BASE_PATH || '/',
    optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
    // GitHub Pages can serve cached HTML after replacing the previous deployment's assets.
    worker: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  }
})
