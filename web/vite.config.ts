import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

// relative base so the build works from any static host or subfolder
export default defineConfig({ base: './', plugins: [react(), tailwindcss()], define: { __APP_VERSION__: JSON.stringify(pkg.version) } })
