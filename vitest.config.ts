import { defineConfig } from 'vitest/config'

// Config de testes isolada de vite.config.ts de propósito — ver comentário lá.
// `npm run build` / `npm run deploy` nunca leem este arquivo.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
