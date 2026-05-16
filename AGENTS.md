# AGENTS.md

## Core Project

- LockIn is a Chrome/Chromium Manifest V3 extension that blocks configured distracting sites using two separate rules: the **Hard Lock Window** and the **Daily Solve Gate**. Use the domain terms from `CONTEXT.md` exactly.
- `IMPLEMENTATION.md` is the product spec for v1 behavior. The current codebase does not implement most of it yet; treat it as the target, not the current state.
- The current executable extension surfaces are defined by `manifest.config.ts`:
  - popup: `src/popup/index.html` -> `src/popup/main.ts`
  - content script: `src/content/main.ts`
  - side panel: `src/sidepanel/index.html` -> `src/sidepanel/main.ts`
- There is no background/service worker entry yet, even though the product plan expects one later.

## Commands

- Use `just` commands, not ad-hoc `pnpm` commands, for normal repo workflows.
- After implementing a change, prefer running `just check` before finishing.
- `just run`: start the Vite dev server.
- `just build`: run `just typecheck`, then build the extension bundle.
- `just linter`: run `oxlint` with warnings denied.
- `just fmt`: format the repo with `oxfmt`.
- `just typecheck`: run the experimental OXC type-aware/type-check pass and the authoritative TypeScript check via `tsc --noEmit`.
- `just test`: run `vitest`.
- `just check`: run `fmt`, `linter`, `typecheck`, and `test` in that order.

## Verification Gotchas

- `just test` currently fails if no test files exist because `vitest run` exits non-zero in that case.
- `just check` writes formatting changes because it runs `just fmt`, not a read-only format check.
- `just build` depends on `just typecheck`, so OXC compatibility issues will block builds.

## Tooling Facts

- Dev shell is defined in `flake.nix` and includes `nodejs_22`, `pnpm_10`, `just`, `typescript`, `oxlint`, `oxfmt`, and `chromium`.
- `flake.nix` auto-runs `pnpm install` when `node_modules` is missing.
- Vite uses the `@/*` alias for `src/*`; keep `tsconfig.json` and `vite.config.ts` aligned if aliasing changes.
- Build output is bundled by CRXJS via `vite.config.ts`, and release zips are written to `release/`.

## Working Notes

- Check `ISSUES.md` before starting feature work; it is the clearest verified breakdown of intended implementation slices and dependencies.
- Prefer updating the real extension entrypoints over editing scaffold helper code unless the task is explicitly about the scaffold.
- For live LeetCode request/response sanity checks, agents may use the `patrickhaahr` username; keep automated tests deterministic and mocked unless the task explicitly calls for live verification.
