import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['server/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: [
        'server/notes.js',
        'server/store.js',
        'server/app.js',
        'server/model.js',
        'server/constraints.js',
        'server/jev.js',
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
