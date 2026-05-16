# LockIn Implementation Issues

These are tracer-bullet implementation slices derived from the agreed plan. Each slice is end-to-end and independently verifiable.

## Proposed Breakdown

1. **Title**: Scaffold MV3 extension with popup shell and shared state model
   **Status**: done
   **Type**: AFK
   **Blocked by**: None
   **User stories covered**: first-run popup setup foundation, popup-first architecture, Vite + TypeScript setup

   ## What to build

   Create the Manifest V3 extension scaffold using TypeScript and Vite, with a service worker, popup entrypoint, block-page entrypoint, shared storage/types, and a minimal popup shell that can render first-run setup mode or regular mode based on saved configuration.

   ## Acceptance criteria
   - [x] The extension builds and loads as a Manifest V3 extension in Chromium-based browsers.
   - [x] The popup can render setup mode when required settings are missing.
   - [x] Shared extension state/types exist for current config, pending config, blocked roots, and verification status.
   - [x] The popup has a regular-mode shell with a settings entrypoint and in-popup subview navigation.

   ## Blocked by

   None - can start immediately

2. **Title**: Implement blocked-root configuration with immediate adds and pending removals
   **Status**: done
   **Type**: AFK
   **Blocked by**: 1
   **User stories covered**: configurable blocked sites, default Twitter/X roots, immediate additions, next-day removals

   ## What to build

   Build blocked-root management in the popup settings subview. Start from default Twitter/X roots on initial setup, accept bare roots or full URLs, normalize to root domains with public-suffix-aware parsing, reject redundant roots across active and pending state, apply additions immediately, and schedule removals for the next browser-local day. Show active and pending blocked roots in separate sections.

   ## Acceptance criteria
   - [x] First-run setup persists the default Twitter/X blocked roots without asking the user to configure them.
   - [x] Settings accept either a bare root or a full URL and normalize to a lowercase root domain.
   - [x] Redundant blocked roots are rejected against both active and pending state.
   - [x] Adding a blocked root takes effect immediately and appears in the active list.
   - [x] Removing a blocked root schedules it for next-day removal and shows it in pending state.
   - [x] Re-adding a root that is pending removal cancels that pending removal.

   ## Blocked by
   - Issue 1

3. **Title**: Save first-run setup and delayed protected settings from the popup
   **Status**: done
   **Type**: AFK
   **Blocked by**: 1
   **User stories covered**: first-run setup, tracked profile configuration, hard lock window configuration, current vs pending settings

   ## What to build

   Implement the popup setup/settings flow for the `Tracked Profile` and `Hard Lock Window`. First-run setup should collect these values, save them, and switch the popup into normal mode. Later edits happen from the popup settings subview, where active and pending values are shown separately. Protected setting changes save as pending and only take effect on the next browser-local day.

   ## Acceptance criteria
   - [x] First-run popup setup collects the `Tracked Profile` and `Hard Lock Window` and persists them successfully.
   - [x] Equal hard-lock start/end values are treated as a full-day lock.
   - [x] After first-run save, the popup switches to regular mode.
   - [x] Later protected setting edits are shown as pending for tomorrow instead of replacing the active values immediately.
   - [x] The popup settings view clearly separates active and pending protected settings.

   ## Blocked by
   - Issue 1

4. **Title**: Enforce daily change lock for protected settings
   **Status**: done
   **Type**: AFK
   **Blocked by**: 3
   **User stories covered**: once-per-day changes, anti-bypass behavior, first-run setup exemption

   ## What to build

   Add the once-per-browser-local-day change lock for protected settings. The initial setup save is free. After that, only one real change per browser-local day is allowed across the `Tracked Profile` and `Hard Lock Window`, and once a pending protected change exists, it cannot be edited again until the next browser-local day.

   ## Acceptance criteria
   - [x] First-run setup does not consume the daily protected-settings change allowance.
   - [x] A real protected-settings change consumes the day’s one allowed protected change.
   - [x] Saving unchanged protected values does not consume the day’s allowance.
   - [x] Once a pending protected change exists, further protected edits are blocked until the next browser-local day.
   - [x] The popup explains when the next protected change becomes available.

   ## Blocked by
   - Issue 3

5. **Title**: Verify the Daily Solve Gate from LeetCode accepted submissions
   **Status**: done
   **Type**: AFK
   **Blocked by**: 1, 3
   **User stories covered**: accepted-solve detection, browser-local-day gate, invalid profile handling, failure states

   ## What to build

   Implement the shared verification flow that queries LeetCode’s public GraphQL endpoint for the most recent accepted submission of the configured `Tracked Profile`. Use browser-local date logic to decide whether the `Daily Solve Gate` is satisfied for today. Treat invalid usernames as `Setup required`, network/API failures as `Verification failed`, and cache only successful “allowed today” results for the current browser-local day.

   ## Acceptance criteria
   - [x] The verification flow fetches the latest accepted submission from LeetCode GraphQL.
   - [x] A same-day accepted submission satisfies the `Daily Solve Gate` for the current browser-local day.
   - [x] A repeated accepted solve on an already-solved problem still counts for today.
   - [x] Invalid usernames are surfaced as `Setup required`.
   - [x] LeetCode/network failures are surfaced as `Verification failed`.
   - [x] Successful allow state is cached for the current browser-local day; blocked results are not cached.

   ## Blocked by
   - Issue 1
   - Issue 3

6. **Title**: Drive popup status states and manual verification actions
   **Status**: done
   **Type**: AFK
   **Blocked by**: 3, 5
   **User stories covered**: status-first popup, check-now flow, first-run follow-up verification, status details

   ## What to build

   Connect the popup UI to the shared verification and rule-evaluation logic. Support the five popup states: `Setup required`, `Blocked by Hard Lock`, `Blocked by Daily Solve Gate`, `Allowed Today`, and `Verification failed`. After initial setup, run one immediate verification. The regular popup should stay read-only on open, expose `Check now`, debounce repeated checks, show the latest accepted solve timestamp when available, and show the next relevant unlock time or condition.

   ## Acceptance criteria
   - [x] The popup renders the five agreed top-level states.
   - [x] Opening the popup does not automatically verify, except for the one post-setup verification.
   - [x] `Check now` triggers the shared verification flow and is debounced against repeated clicks.
   - [x] The popup shows the latest accepted solve timestamp when available.
   - [x] The popup shows the next relevant unlock time or condition for blocked states.

   ## Blocked by
   - Issue 3
   - Issue 5

7. **Title**: Redirect blocked navigations to the local Block Page
   **Status**: pending
   **Type**: AFK
   **Blocked by**: 2, 5
   **User stories covered**: same-tab blocking, preserved original destination, all blocked roots covered

   ## What to build

   Implement blocked-site enforcement in the service worker by detecting navigations to active blocked roots and redirecting them to the local block page in the same tab whenever the `Hard Lock Window` or `Daily Solve Gate` requires blocking. Preserve the original blocked destination for later retry.

   ## Acceptance criteria
   - [ ] Navigations to active blocked roots are redirected to the block page in the same tab when access should be denied.
   - [ ] The original blocked destination is preserved and available for retry.
   - [ ] Subdomains of active blocked roots are enforced.
   - [ ] Access is allowed immediately when the current state permits it.

   ## Blocked by
   - Issue 2
   - Issue 5

8. **Title**: Build the Block Page with reason-aware copy and retry flow
   **Status**: pending
   **Type**: AFK
   **Blocked by**: 5, 7
   **User stories covered**: reason-specific block page, check-again flow, original destination visibility

   ## What to build

   Create the local block page shown for denied blocked-site access. It should render different copy for `Blocked by Hard Lock` and `Blocked by Daily Solve Gate`, display the blocked hostname or URL, show the latest accepted solve timestamp when available, show the next relevant unlock time or condition, automatically verify once on load, and offer a debounced `Check again` action that uses the shared verification flow and returns to the original destination when access becomes allowed.

   ## Acceptance criteria
   - [ ] The block page explains whether the denial came from the `Hard Lock Window` or the `Daily Solve Gate`.
   - [ ] The original blocked destination is visible to the user.
   - [ ] The block page verifies once on load and also supports a debounced `Check again` action.
   - [ ] When access becomes allowed, retry returns the user to the original destination.

   ## Blocked by
   - Issue 5
   - Issue 7

9. **Title**: Enforce alarms for hard-lock and day-boundary transitions
   **Status**: pending
   **Type**: AFK
   **Blocked by**: 5, 7
   **User stories covered**: active enforcement at 11pm, 9am, and midnight

   ## What to build

   Schedule and handle extension alarms for hard-lock start, hard-lock end, and local midnight. These transitions should update active state, clear stale day-based allow cache when needed, activate next-day pending settings/removals, and redirect already-open blocked-site tabs whenever the new state requires blocking.

   ## Acceptance criteria
   - [ ] The extension schedules reevaluation at hard-lock start, hard-lock end, and local midnight.
   - [ ] Local midnight activates pending protected settings and pending blocked-site removals.
   - [ ] Local midnight resets the day-based allow cache.
   - [ ] Already-open matching tabs are redirected when a transition causes them to become blocked.

   ## Blocked by
   - Issue 5
   - Issue 7

10. **Title**: Apply immediate enforcement for newly added blocked roots
    **Status**: pending
    **Type**: AFK
    **Blocked by**: 2, 5, 7
    **User stories covered**: immediate blocked-root additions, active enforcement consistency

    ## What to build

    When a user adds a new blocked root in settings, immediately reevaluate open tabs and redirect any matching tab to the block page if the current state requires blocking. This keeps blocked-root additions consistent with the rest of active enforcement.

    ## Acceptance criteria
    - [ ] Adding a blocked root immediately reevaluates currently open matching tabs.
    - [ ] Matching tabs are redirected right away when the current state requires blocking.
    - [ ] Matching tabs remain untouched when the current state allows access.

    ## Blocked by
    - Issue 2
    - Issue 5
    - Issue 7

## Review Questions

1. Does this granularity feel right, or is it too coarse / too fine?
2. Are the dependency relationships correct?
3. Should any slices be merged or split further?
4. Are all slices correctly marked as AFK?
