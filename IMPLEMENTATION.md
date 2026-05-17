# LockIn Implementation Notes

This file records current implementation decisions for the first version of the extension.

## Chosen Decisions

- Platform: Chrome/Chromium Manifest V3 extension.
- Language: TypeScript.
- Build tool: Vite.
- Package manager: pnpm.
- Linter: oxlint.
- Formatter: oxfmt.
- Styling: CSS.
- UI scope: minimal first.
- UI surfaces: popup and block page.
- Popup behavior: show current status and a `Check now` action.
- Popup loading behavior: opening the popup does not trigger automatic verification.
- First-run popup behavior: when no configuration exists, the popup opens in setup mode instead of the regular status UI.
- Initial setup flow: the first-run popup collects the initial configuration and, after save, the popup switches to the regular status UI.
- Post-setup behavior: after the initial save, the extension runs one verification immediately.
- Post-setup failure state: if that verification fails, setup remains saved and the popup shows `Verification failed`.
- Later configuration entrypoint: the regular popup includes a settings icon for changing configuration later.
- Popup navigation model: settings open as an in-popup subview with navigation back to the main popup state.
- Popup settings layout: separate `Active` and `Pending` sections.
- Popup settings save model: blocked-sites edits and protected-settings edits save independently.
- Popup status model: one primary top-level state, with supporting detail below it.
- Popup top-level states: `Setup required`, `Blocked by Hard Lock`, `Blocked by Daily Solve Gate`, `Allowed Today`, and `Verification failed`.
- Time basis: browser local time.
- Blocking scope: configurable blocked hostnames, defaulting to `twitter.com`, `x.com`, and related subdomains such as `www` and `mobile`.
- Blocked-site enforcement mechanism: replace the current blocked tab body in place instead of redirecting to a separate extension page.
- Blocked-site enforcement rationale: Chrome MV3 does not provide a reliable synchronous same-tab redirect mechanism for this extension architecture.
- Blocked sites input model: users configure domain roots, and the extension includes subdomains automatically.
- Blocked sites mutation rules: additions are immediate and unlimited; removals are allowed at any time but only take effect on the next browser-local day.
- Blocked sites immediate enforcement: newly added roots are enforced against already-open matching tabs right away when the current state requires blocking.
- Blocked sites settings UI: active roots remain in the `Active` section; scheduled removals appear in the `Pending` section.
- Blocked sites pending-removal behavior: re-adding a root scheduled for removal cancels the pending removal.
- Blocked sites pending-removal lock: once a root is scheduled for removal, it remains pending until the next browser-local day unless the user explicitly cancels that pending removal by re-adding the same root.
- Initial blocked sites: first-run setup starts with the default Twitter/X roots and does not ask for blocked-site configuration.
- Blocked sites validation: reject redundant roots across both active and pending state.
- Blocked sites normalization: roots are trimmed and lowercased before validation and storage.
- Blocked sites input flexibility: users may enter a bare root or a full URL.
- Blocked sites URL normalization: pasted URLs are reduced to the root-domain model used by blocking.
- Blocked sites root parsing: URL normalization uses a public-suffix-aware parser, not naive label trimming.
- Hard lock: configurable in options, defaulting to `11:00pm-9:00am` local time.
- Daily rule: outside the hard lock, all blocked sites remain blocked until at least one accepted LeetCode submission exists for the current browser-local day.
- Verification source: LeetCode GraphQL accepted submissions query.
- Verification timing: check when opening a blocked site.
- Verification controls: popup `Check now` and block-page `Check again` both run the shared verification flow.
- Verification debounce: repeated manual verification requests are coalesced for a short interval.
- Allow caching: cache successful verification for the current browser-local day.
- Blocked-state caching: do not cache blocked results.
- Failure mode: fail closed if LeetCode cannot be verified or the tracked username is not configured.
- Invalid tracked profile handling: treat a nonexistent LeetCode username as `Setup required`, not `Verification failed`.
- Tracked profile source: locally configured username.
- Settings change lock: the `Hard Lock Window` and the `Tracked Profile` share a once-per-browser-local-day change limit.
- Settings lock trigger: only a real change to a saved value consumes that day's change.
- Settings lock UI: disable saving and show when the next change becomes available.
- First-run setup: the initial configuration save is free and does not consume that day's change.
- Protected settings activation: changes to the `Hard Lock Window` or `Tracked Profile` are stored immediately but only take effect on the next browser-local day.
- Protected settings pending lock: once a pending protected change exists, it cannot be edited again until the next browser-local day.
- Repeat accepted submissions: count as valid for the day even if the problem was solved before.
- Active enforcement: replace already-open blocked-site tab bodies when the hard lock starts or the browser-local day resets into a blocked state.
- Block page behavior: show the reason, recent status, preserve the original destination, and re-check on load with a manual retry button while keeping the blocked tab on its original URL.
- Status detail: show the most recent accepted solve timestamp even when today's gate is not satisfied.
- Status detail: show the next relevant unlock time or condition.
- Manual override: none.

## Clarified Time Behavior

- A solve during the hard lock still counts for the current browser-local day, but access stays blocked until `9:00am`.
- A solve during `11:00pm-11:59pm` does not carry into the next browser-local day.
- The configurable hard lock window may represent any time range, including a full-day lock.
