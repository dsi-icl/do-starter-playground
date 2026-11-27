import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite-plus';

const basePath = process.env.VITE_BASE_PATH ?? '/';
const assetPath = (path: string) => `${basePath}${path}`;
const routerBasePath = basePath === '/' ? '/' : basePath.replace(/\/$/, '');

export default defineConfig({
    base: basePath,
    resolve: {
        tsconfigPaths: true
    },
    server: {
        port: 5780,
        watch: {
            usePolling: true,
            interval: 100
        }
    },
    css: {
        transformer: 'lightningcss',
        lightningcss: {
            cssModules: true
        }
    },
    plugins: [
        devtools({
            consolePiping: { enabled: false }
        }),
        tanstackStart({
            router: { basepath: routerBasePath },
            prerender: { enabled: true },
            pages: [{ path: '/' }, { path: '/control' }, { path: '/noop' }, { path: '/screen' }]
        }),
        // https://tanstack.com/start/latest/docs/framework/react/guide/hosting
        nitro({
            features: { websocket: true }
        }),
        VitePWA({
            outDir: '.output/public',
            scope: basePath,
            registerType: 'autoUpdate',
            injectRegister: false,
            includeAssets: [
                'gatebook-icon.svg',
                'gatebook-icon-180.png',
                'gatebook-icon-192.png',
                'gatebook-icon-512.png'
            ],
            manifest: {
                name: 'Gatebook · event check-in',
                short_name: 'Gatebook',
                description: 'A private, offline-ready attendee register.',
                start_url: basePath,
                scope: basePath,
                theme_color: '#18263d',
                background_color: '#f3f5f7',
                display: 'standalone',
                orientation: 'any',
                icons: [
                    {
                        src: assetPath('gatebook-icon-192.png'),
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: assetPath('gatebook-icon-512.png'),
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    },
                    {
                        src: assetPath('gatebook-icon.svg'),
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    }
                ]
            },
            workbox: {
                additionalManifestEntries: [{ url: basePath, revision: String(Date.now()) }],
                globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                skipWaiting: true,
                clientsClaim: true
            }
        }),
        viteReact(),
        // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#react-compiler
        babel({
            presets: [
                reactCompilerPreset({
                    target: '19'
                })
            ]
        }),
        tailwindcss()
    ]
});
