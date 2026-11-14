import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A static site: `npm run build` writes plain files to dist/, ready for any static host.
// `base: './'` keeps asset links relative, so it also works from a sub-path such as GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5180 },
});
