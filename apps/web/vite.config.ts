import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import Pages from 'vite-plugin-pages';

export default defineConfig({
  plugins: [
    react(),
    Pages({
      dirs: 'src/pages',
      extensions: ['tsx', 'jsx', 'ts', 'js'], 
      importMode: 'async',
    }),
  ],
})
