import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['electron-squirrel-startup']
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
