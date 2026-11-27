# Gatebook

Gatebook is an installable, offline-ready attendee register for event staff. Import an `.xlsx`
roster, search by attendee name or email, filter the expected group by one column and any number
of values, and mark each person **Here** or **Not here**. People with no status remain clearly
undecided. Registers are saved as named snapshots, so earlier absences remain visible later in the
day.

The workbook is parsed in the browser. Roster data, register results, and backups are kept on the
current device; there is no account or cross-device sync.

## Run locally

Install the workspace dependencies and start the website app:

```powershell
corepack pnpm install
corepack pnpm --filter website dev
```

Open the local URL printed by the dev server. The development server is for previewing and does not
provide the production service worker needed for offline use.

## Build and host

Create a production build:

```powershell
corepack pnpm --filter website build
```

GitHub Pages deployment is configured in `.github/workflows/pages.yml`. TanStack Start prerenders
the app routes during the normal Nitro build, and the workflow publishes only the generated static
files in `.output/public`; no server is deployed. The Vite base, router, manifest, and service worker
are scoped to the repository subpath. Enable **Settings → Pages → Build and deployment → Source →
GitHub Actions**. Merging the workflow to `main` triggers the first deployment; later pushes to
`main` deploy updates. The expected project-site URL is
`https://dsi-icl.github.io/do-starter-playground/`. No deployment has been run from this worktree.

The GitHub Pages build prerenders the app routes and emits the service worker and manifest within
the repository subpath. The roster and check-ins remain local to each browser/device; Pages does
not receive attendee data. GitHub Pages cannot host the repository's existing `/bus` WebSocket
endpoint, so the legacy `/control` and `/screen` synchronized demo will not work there; Gatebook
does not depend on that endpoint.

## Install on a phone or tablet

- **Xiaomi Android:** open the HTTPS app URL in Chrome, tap **Install app** in Gatebook (or use
  Chrome's menu and choose **Install app** / **Add to Home screen**).
- **iPad:** open the HTTPS app URL in Safari, tap **Share**, then **Add to Home Screen**.

The first visit and installation must happen while online. Leave Gatebook open until its header
shows **Offline ready**; the service worker then has the app files available for future offline
launches. Each browser installation has its own local roster and event records.

## Event-day data

- Download a **JSON backup** to preserve the roster and every register, and use **Restore a backup**
  to recover it on that device.
- **CSV export** includes the roster and each register's Here / Not here / No mark status.
- Starting a new event clears the old event's registers but keeps the roster. Importing a new
  spreadsheet replaces both the roster and the current event history after confirmation.
- Browser data can be removed by clearing site data, and it does not follow you to another device.
  Keep an exported backup somewhere safe, especially before changing devices or clearing browser
  storage.
