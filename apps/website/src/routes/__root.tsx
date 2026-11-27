import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    ScriptOnce,
    Scripts
} from '@tanstack/react-router';

import { ThemeProvider } from '../lib/theme-provider';

import appCss from '../style.css?url';

export const Route = createRootRouteWithContext()({
    head: () => ({
        meta: [
            {
                charSet: 'utf-8'
            },
            {
                name: 'viewport',
                content: 'width=device-width, initial-scale=1, viewport-fit=cover'
            },
            {
                title: 'Gatebook · event check-in'
            },
            {
                name: 'description',
                content:
                    'An offline-ready attendee register that keeps your event roster on your device.'
            },
            {
                name: 'theme-color',
                content: '#18263d'
            },
            {
                name: 'apple-mobile-web-app-capable',
                content: 'yes'
            },
            {
                name: 'apple-mobile-web-app-status-bar-style',
                content: 'default'
            }
        ],
        links: [
            {
                rel: 'icon',
                href: `${import.meta.env.BASE_URL}gatebook-icon.svg`,
                type: 'image/svg+xml'
            },
            {
                rel: 'apple-touch-icon',
                href: `${import.meta.env.BASE_URL}gatebook-icon-180.png`
            },
            {
                rel: 'manifest',
                href: `${import.meta.env.BASE_URL}manifest.webmanifest`
            },
            { rel: 'stylesheet', href: appCss }
        ]
    }),
    component: RootComponent
});

function RootComponent() {
    // Route outlet is wrapped by the root document shell to share theme/scripts/head.
    return (
        <RootDocument>
            <Outlet />
        </RootDocument>
    );
}

function RootDocument({ children }: { readonly children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                <noscript
                    dangerouslySetInnerHTML={{
                        __html: '<!-- THESIS: An event register, not a generic roster dashboard. OWN-WORLD: cool paper, ink navy, and vermilion ticket marks; ruled attendee lines and clear check-in stamps. STORY: Search the master list, check people in, and carry absences forward across saved registers. FIRST VIEWPORT: event and active round above a progress strip, then search and the attendee queue; check-in actions stay at each row. FORM: An offline-first ticket ledger for event staff, structured as an ordered roster with a new-register action. Seed 1607c1d1, assigned form 4. -->'
                    }}
                />
                {/*
                  Hydration strategy:
                  - We set the `dark` class before React hydrates so the initial server HTML and
                    first painted client frame use the same color theme.
                  - Without this early script, React would hydrate into a different class state
                    and users would see a flash of incorrect theme (FOUC).
                  - `ScriptOnce` guarantees this bootstrap script only executes once per document,
                    even as routes change.
                */}
                <ScriptOnce>
                    {`document.documentElement.classList.toggle(
              'dark',
              localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
          );`}
                </ScriptOnce>
                {/* ThemeProvider keeps theme state in sync across routes, tabs, and iframes. */}
                <ThemeProvider>{children}</ThemeProvider>
                <Scripts />
            </body>
        </html>
    );
}
