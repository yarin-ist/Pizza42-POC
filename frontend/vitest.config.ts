import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest/globals are declared in tsconfig.spec.json
    globals: true,
    // jsdom simulates the browser DOM that Angular's platform-browser needs
    environment: 'jsdom',
    // Initialises Angular's TestBed once before any spec runs
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/app/**/*.ts'],
      exclude: [
        'src/app/**/*.spec.ts',
        'src/app/**/*.html',
        'src/environments/**',
        'src/main.ts',
      ],
    },
  },
});
