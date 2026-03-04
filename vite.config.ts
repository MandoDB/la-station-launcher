import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

// Modules natifs / Node-only à exclure du bundle Electron
// bufferutil + utf-8-validate sont des addons optionnels de 'ws' (utilisé par discord-rpc)
const ELECTRON_EXTERNALS = [
    'electron',
    'bufferutil',
    'utf-8-validate',
    'discord-rpc',
];

export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                // Main process
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: {
                            external: ELECTRON_EXTERNALS,
                        },
                    },
                },
            },
            {
                // Preload script
                entry: 'electron/preload.ts',
                onstart(options) {
                    options.reload();
                },
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: {
                            external: ['electron'],
                        },
                    },
                },
            },
        ]),
        renderer(),
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 5173,
    },
});
