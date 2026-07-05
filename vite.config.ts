import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
// IMPORTANT: este arquivo NUNCA deve importar de 'vitest' ou 'vitest/config'.
// Ele é usado por `npm run build` (e por consequência `npm run deploy`), que não
// pode depender de o vitest estar instalado. A config de testes fica isolada em
// vitest.config.ts.
export default defineConfig({
  base: '/balanceador-de-times-posicoes/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
