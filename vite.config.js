import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/grimiore/',  // the site lives at https://<you>.github.io/grimiore/
})
