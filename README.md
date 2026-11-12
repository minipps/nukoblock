# Nukoblock

A local-only, Vue 3 + WXT browser extension with an ASCII cat, daily site budgets, weekly overrides, deliberate entry pauses, and Catppuccin Mocha colors.

## Development

Requires Node 22.12+ and npm.

```
npm ci
npm run dev
npm run check # Oxlint + e18e, Oxfmt, Vue/TypeScript checks
npm test
npm run build
npm run build:firefox
```

Load `.output/chrome-mv3` using **Load unpacked** on `chrome://extensions`. In Firefox, open `about:debugging`, choose **This Firefox → Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`.

Open the extension's settings to select presets or paste domains/paths. Presets share their aliases' budgets; manually pasted entries have separate budgets. New entries default to 30 minutes/day with an entry pause. Weekly windows replace the base policy, without resetting today's counter. Overnight windows belong to the day on which they start. Overlapping windows are rejected.

Tracking counts the focused tab and audible, unmuted background tabs. Several tabs of one entry count once; simultaneous different sites count separately. Only configured entries are tracked. Idle reading counts, locked time does not. Limits and stats are approximate: checkpoints run every 30 seconds, and delayed intervals over a minute are discarded to avoid charging time spent asleep. Stats retain 30 local calendar days. Full navigation destinations are transient session data, not statistics.

All settings and daily usage remain in this browser. No telemetry, server, or account. Site permissions are requested when adding targets. Rules apply to top-level pages; embedded third-party content is not blocked. This is an editable self-control tool, not tamper protection. Private browsing is not supported.

## Verification limits

Unit tests and builds do not prove browser behavior. Before release, manually exercise both browsers: direct links, SPA transitions, pause continue/back/reload, foreground/background playback, revoked site access, midnight and schedule changes, worker restart and sleep/wake. Browser store publication is not included.

## Code quality

- `npm run lint` runs Oxlint correctness checks (including Vue script and Vitest rules) and the [e18e recommended rules](https://github.com/e18e/eslint-plugin). Recommendations cover modern APIs, avoidable allocations, static regular expressions, and dependency replacements in imports. Warnings fail the check.
- `npm run lint:fix` applies safe available fixes; review the diff and rerun `npm run check` afterward.
- `npm run format` formats the project with [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html), replacing Prettier. `npm run format:check` checks without writing.
- `npm run typecheck` retains `vue-tsc` for Vue templates and TypeScript. Generated output, dependencies, and the lockfile are excluded from formatting; generated output and dependencies are excluded from linting.

Keep dependencies lean: use existing helpers or browser APIs first, and consider e18e replacement suggestions before adding packages. The e18e recommended rules are recorded explicitly in `.oxlintrc.json`; review them when upgrading the plugin. Type-dependent e18e analysis and Vue template-specific lint rules are not covered by this setup. No build-pipeline replacement or additional parser package is needed: WXT continues to own bundling.

## CI and releases

Pull requests and pushes to `main` run lint, formatting, Vue/TypeScript checks, tests, and Chrome/Firefox builds on Node 24. Tag pushes matching `v*` run the checks again, build the distribution ZIPs, and publish a GitHub Release with generated notes. The tag must match the stable `package.json` version, for example `v0.1.1`. Only the publishing job receives repository write permission; PR checks use read-only permissions.

To release from a clean, up-to-date `main` checkout:

```sh
git pull --ff-only
npm ci
npm run release -- patch # or minor / major
# Review the release commit, then run the push command printed by the script:
git push --atomic origin main refs/tags/v0.1.1 # use the actual new tag
```

The script checks the branch, working tree, next tag, code quality, tests, and both builds before running `npm version`. This updates `package.json` and `package-lock.json`, creates a version commit, and creates an annotated tag. It does not push automatically. If Git hooks or signing fail during `npm version`, inspect the working tree and tags before retrying. The atomic push publishes the branch and tag together; a stale branch or existing remote tag causes the push to fail rather than overwrite anything.

For local release artifacts, run `npm run zip` and `npm run zip:firefox`. GitHub Releases include Chrome and Firefox extension ZIPs and the Firefox source ZIP. Firefox packages are unsigned; store signing and browser-store publishing remain manual. No additional release secret is required beyond GitHub Actions' built-in token.
