import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// relative base so the build works from any static host or subfolder
export default defineConfig({ base: './', plugins: [react(), tailwindcss()] })
