import { copyFileSync } from 'node:fs';

import { defineConfig } from 'tsup';

// One entry per public subpath. Add new entries here and in package.json
// "exports" and "typesVersions" together.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core/index.ts',
    builder: 'src/builder/index.ts',
    react: 'src/react/index.ts',
    vue: 'src/vue/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    // tsup's declaration build sets `baseUrl`, which TypeScript 6 deprecates.
    compilerOptions: { ignoreDeprecations: '6.0' },
  },
  tsconfig: 'tsconfig.react.json',
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  platform: 'neutral',
  // react, react/jsx-runtime and vue come from the consumer (peer dependencies).
  external: ['react', 'react/jsx-runtime', 'vue'],
  onSuccess: async () => {
    copyFileSync('src/react/styles.css', 'dist/styles.css');
  },
});
