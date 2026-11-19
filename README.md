<p align="center"><img src="public/icon/128.png" width="96" alt="Nukoblock icon"></p>

# Nukoblock

[![CI](https://github.com/minipps/nukoblock/actions/workflows/ci.yml/badge.svg)](https://github.com/minipps/nukoblock/actions/workflows/ci.yml)
[![Release](https://github.com/minipps/nukoblock/actions/workflows/release.yml/badge.svg)](https://github.com/minipps/nukoblock/actions/workflows/release.yml)

A local-only browser extension for Chrome and Firefox that sets daily time budgets for sites, with weekly schedules, an optional pause before entering, and an ASCII cat.

## How it works

- Add sites from presets or paste domains/paths. New entries default to 30 min/day with an entry pause.
- Weekly windows override the base budget. Overnight windows count toward the day they start.
- Time counts for the focused tab and audible background tabs. Multiple tabs of one site count once.
- Counting is approximate (30 s checkpoints). Stats are kept for 30 days.
- Everything stays in your browser. No telemetry, accounts or servers.
- This is a self-control tool, not tamper protection. Embedded content and private windows aren't covered.

## Development

Requires Node 22.12+.

```sh
npm ci
npm run dev             # dev build with reload
npm run check           # lint, format check, typecheck
npm test
npm run build           # Chrome → .output/chrome-mv3
npm run build:firefox   # Firefox → .output/firefox-mv3
```

Load the Chrome build via **Load unpacked** on `chrome://extensions`. For Firefox, use `about:debugging` → **This Firefox** → **Load Temporary Add-on** and pick `.output/firefox-mv3/manifest.json`.

Tests don't cover real browser behavior, so try both browsers by hand before releasing.

## Releasing

On a clean, up-to-date `main`:

```sh
npm run release -- patch   # or minor / major
git push --atomic origin main refs/tags/vX.Y.Z   # the script prints this
```

Pushing the tag builds the ZIPs, publishes a GitHub Release and submits the Firefox build to AMO.
