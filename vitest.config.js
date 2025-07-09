import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,          // allow `describe`/`it`/`expect` without import
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
  
});
