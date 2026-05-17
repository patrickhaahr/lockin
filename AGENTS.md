# AGENTS.md

## Core Project

- LockIn is a Chrome/Chromium Manifest V3 extension that blocks configured distracting sites using two separate rules: the **Hard Lock Window** and the **Daily Solve Gate**. Use the domain terms from `CONTEXT.md` exactly.
- `IMPLEMENTATION.md` is the product spec for v1 behavior. `CONTEXT.md` defines the domain language and relationships. Both are current and authoritative.
- The v1 feature set is fully implemented. The extension surfaces are defined by `manifest.config.ts`:
  - popup: `src/popup/index.html` -> `src/popup/main.ts`
  - content script: `src/content/main.ts`
  - background/service worker: `src/background/main.ts`
  - block page: `src/block/index.html` (web accessible resource rendered inside blocked tabs)
- The content script replaces the document body in-place on blocked tabs instead of redirecting. Chrome MV3 does not provide a reliable synchronous same-tab redirect mechanism for this architecture.
- Shared logic lives in `src/shared/` (state, storage, verification, types). Tests live in `tests/` and mirror the `src/` structure.

## Commands

- Use `just` commands for all normal repo workflows; avoid ad-hoc `pnpm` invocations.
- Run `just check` after every implementation change. It formats, lints, type-checks, and runs tests in order.

## Testing Note

- For live LeetCode request/response sanity checks, agents may use the `patrickhaahr` username. Keep automated tests deterministic and mocked unless the task explicitly calls for live verification.
