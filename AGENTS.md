# AGENTS.md

## Cursor Cloud specific instructions

This is a single, minimal vanilla-JS sandbox bundled with **Parcel v1** (`parcel-bundler`). There is no backend, database, or external service. Scripts live in `package.json`; the active entry is `index.html` → `src/index3.js`.

- Dependencies are installed by the startup update script (`npm install`). No lockfile is committed, so the resolved tree can vary slightly between runs.
- Dev server: run `npx parcel index.html --port 1234` rather than `npm start`. The `npm start` script appends `--open`, which tries to launch a browser and is not useful in a headless VM. Default port is `1234`.
- Build: `npm run build` (outputs to `dist/`). There is no separate prod server; serve `dist/` statically if needed.
- No lint or test scripts are defined in this repo.
- The app only logs to the browser console (`checkSum(50, 49)` prints `under 100`); there is no visible UI output beyond the static `updated!` text. Verify behavior via the browser devtools console, not the page body.
- Parcel v1 is unmaintained but builds/runs fine on the VM's Node 22.
