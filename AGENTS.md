<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read these installed skill files directly (use these paths even if a same-named global skill exists):
- Core filter, always on: `antislop`: `.agents/skills/antislop/SKILL.md`
- UI / visual: `antislop-ui`: `.agents/skills/antislop-ui/SKILL.md`
- People: `antislop-human`: `.agents/skills/antislop-human/SKILL.md`
- Mobile / responsive: `antislop-layoutmobile`: `.agents/skills/antislop-layoutmobile/SKILL.md`
- Copy & text: `antislop-copywriting`: `.agents/skills/antislop-copywriting/SKILL.md`
- Code comments: `antislop-code`: `.agents/skills/antislop-code/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: `npx antislop-ai --update`, or run `npx antislop-ai` and pick Overwrite them.
<!-- antislop:end -->

# AGENTS.md — DISTUDIO Photobooth

Kiosk photobooth built with SvelteKit 3 + Svelte 5 + Tailwind 4/daisyUI. No database: three small JSON endpoints are the only server code. UI copy is Indonesian — keep it that way.

## Commands

- `npm run dev` — Vite on `0.0.0.0:5173`. Host binding is intentional so phones can open the QR gallery.
- `npm run check` — `svelte-kit sync` + `svelte-check` (baseline: 0 errors). Run it after adding or renaming routes; `$types` only exist after sync.
- `npm run build` — closest thing to a test suite; there are no unit or E2E tests.
- `npm run lint` / `npm run format` — Prettier check/write. The repo is formatted, so treat a lint failure as your own drift; ignored paths are listed under Conventions.
- Verify with `npm run check` → `npm run build` → the manual kiosk flow in a browser.

## Toolchain

- No `svelte.config.js`: SvelteKit is configured in `vite.config.ts` inside `sveltekit({ ... })`, with `adapter-auto` and automatic runes detection. Don't add one.
- `src/routes/+layout.ts` sets `ssr = false` and `prerender = false` app-wide; all screens are client-rendered.
- Import app code as `#lib/...` (package.json `imports` + tsconfig `paths`), never `$lib/...`.
- `gifenc` is CJS-only; keep `ssr: { noExternal: ['gifenc'] }` or named imports break.
- Tailwind v4 is CSS-first (`@import "tailwindcss"` and `@plugin "daisyui/theme"` in `src/app.css`). There is no `tailwind.config.ts`, and `prettier.config.js` must point `tailwindStylesheet` at `src/app.css`.

## Structure and state

- Screens are routes: `/` start → `/strip` (photo count 1–6) → `/camera` → `/review` → `/editor` → `/print`; `/gallery/[id]` is the guest gallery. Screen components live in `src/lib/page/*`, their parts in `src/lib/features/*`.
- `src/lib/stores/session.ts` owns session state, `SCREEN_PATH`, and `goTo()` — the only screen-name → URL map. A new screen needs the `Screen` type, `SCREEN_PATH`, and a route file.
- Guards live in each `+page.svelte` (the layout is shared chrome only) and redirect when photos are missing or incomplete; don't move that logic into components.
- Photos are data URLs in the store only. Only theme/camera settings and saved templates survive a reload.

## Rendering and print invariants

- `src/lib/utils/canvas.ts` is the single renderer for preview, PNG export, and print. Sizes come from `PRODUK` (true 300 DPI print size per photo count); never hardcode sheet dimensions.
- Photo 1 ("Big shot") is landscape 1800×1200; counts 2–6 are portrait 1200×1800. "Two up" is the only 2-copy sheet, with a dashed cut line at x=600.
- Print depends on the hidden `#print-layout` in `src/routes/+layout.svelte` and `@media print { @page { size: 4in 6in } }` in `src/app.css`.
- `capture.ts` mirrors every frame horizontally (selfie view). Custom-template slot geometry is normalized 0..1.
- Editor preview has one reactive render trigger plus a `renderSeq`/`isStale` guard across awaits; a second trigger reintroduces the double-render bug fixed in `01e39f2`.

## Theme

- daisyUI themes `distudio-dark` / `distudio-light` are declared in `src/app.css`; `+layout.svelte` writes `data-theme` on `<html>` from the store.
- localStorage key `distudio-theme` is read by the pre-paint script in `app.html` and by `session.ts`; keep both in sync. Camera settings use `distudio-camera-settings`.
- Code defaults to light while `DESIGN.md` describes dark as the default; confirm intent before "fixing" either side.

## Gallery

- `POST /api/gallery` and `GET /api/gallery/[id]` (plus `/api/network-ip`) persist sessions to `.gallery_cache/<id>.json` (gitignored, often multi-MB) and an in-memory map; the client also keeps an IndexedDB copy.
- That needs a Node runtime with writable disk. `adapter-auto` currently detects no environment, and static/serverless hosting breaks the QR gallery.
- `resolveGalleryUrl()` swaps localhost for the machine LAN IP so phones can open the QR link. Viewing works over plain HTTP on the LAN; camera capture still requires HTTPS or localhost.

## Design and docs

- `DESIGN.md` plus the tokens in `src/app.css` are the visual source of truth.
- `docs/technical/*` and `docs/product/DESIGN_SYSTEM.md` are the pre-build spec and partly stale (single-page architecture, `session.js`, 300×900 preview, old palette). `docs/product/PRINT_SPECIFICATION.md` still matches `PRODUK`.
- `static/templates/*.svg` are downloadable cut guides; their viewBoxes must match `PRODUK`.

## Conventions

- Prettier: tabs, single quotes, no trailing comma, 100 cols, Svelte + Tailwind plugins. `/static/`, `/.agents/`, `/.opencode/`, and `/AGENTS.md` are Prettier-ignored; the first three are tool-managed/hash-locked.
- Comments mix Indonesian and English; UI copy is Indonesian.
- `postman/`, `.postman`, `.gallery_cache/`, `scratch/`, `check_*.js`, `inspect_*.js` are gitignored; don't rely on them being committed.
- Skills are installed under `.agents/skills/` (antislop suite, daisyUI). Read the daisyUI skill before inventing component markup.
