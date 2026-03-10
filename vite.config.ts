import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';

// Charger le .env au moment du build pour injecter les variables dans le bundle
loadDotenv();

// Modules natifs / Node-only à exclure du bundle Electron
// bufferutil + utf-8-validate sont des addons optionnels de 'ws' (utilisé par discord-rpc)
const ELECTRON_EXTERNALS = [
    'electron',
    'bufferutil',
    'utf-8-validate',
    'discord-rpc',
    'adm-zip',
];

// Token injecté dans le binaire compilé (jamais dans un fichier runtime séparé)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';

export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                // Main process
                entry: 'electron/main.ts',
                vite: {
                    define: {
                        '__GITHUB_TOKEN__': JSON.stringify(GITHUB_TOKEN),
                    },
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
