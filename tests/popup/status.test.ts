import { describe, expect, it } from "vitest";
import { createConfiguredState, createEmptyExtensionState } from "../../src/shared/state";
import {
  getBlockedSiteAccessDecision,
  getBlockedSiteStatusKind,
} from "../../src/shared/blocked-site-policy";
import {
  formatAcceptedSolveTimestamp,
  getBlockedSiteStatusViewModel,
} from "../../src/shared/blocked-site-presentation";

const ACTIVE_PROTECTED_SETTINGS = {
  trackedProfile: "lockin-user",
  hardLockWindow: {
    start: "23:00",
    end: "09:00",
  },
} as const;

function createConfiguredTestState() {
  return createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
}

function createLocalDate(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number,
): Date {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0);
}

describe("popup status view model", () => {
  it("renders setup required when configuration is missing", () => {
    const state = createEmptyExtensionState();

    expect(getBlockedSiteStatusKind(state, createLocalDate(2026, 4, 16, 10, 0))).toBe(
      "setupRequired",
    );
  });

  it("renders setup required for an invalid tracked profile", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "setupRequired",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: null,
      allowCacheBrowserLocalDay: null,
    };

    const popupStatus = getBlockedSiteStatusViewModel(state, createLocalDate(2026, 4, 16, 10, 0));

    expect(popupStatus.title).toBe("Setup required");
    expect(popupStatus.nextRelevantValue).toContain("Tracked Profile");
  });

  it("renders blocked by hard lock while the hard lock window is active", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "allowedToday",
      checkedAt: createLocalDate(2026, 4, 16, 0, 10).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 16, 0, 0).toISOString(),
      allowCacheBrowserLocalDay: "2026-05-16",
    };

    const popupStatus = getBlockedSiteStatusViewModel(state, createLocalDate(2026, 4, 16, 7, 30));

    expect(popupStatus.title).toBe("Blocked by Hard Lock");
    expect(popupStatus.nextRelevantValue).toContain("09:00");
    expect(popupStatus.lastAcceptedSolveValue).toBe("2026-05-16 00:00");
  });

  it("prioritizes blocked by hard lock over verification failed during the hard lock window", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "verificationFailed",
      checkedAt: createLocalDate(2026, 4, 16, 7, 15).toISOString(),
      lastAcceptedSolveAt: null,
      allowCacheBrowserLocalDay: null,
    };

    expect(getBlockedSiteStatusKind(state, createLocalDate(2026, 4, 16, 7, 30))).toBe(
      "blockedByHardLock",
    );
  });

  it("renders blocked by daily solve gate outside the hard lock window", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "blockedByDailySolveGate",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 21, 45).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    const popupStatus = getBlockedSiteStatusViewModel(state, createLocalDate(2026, 4, 16, 10, 15));

    expect(popupStatus.title).toBe("Blocked by Daily Solve Gate");
    expect(popupStatus.nextRelevantValue).toContain("Accepted Solve");
    expect(popupStatus.lastAcceptedSolveValue).toBe("2026-05-15 21:45");
  });

  it("renders allowed today when the current browser-local day already has an accepted solve", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "allowedToday",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 16, 8, 30).toISOString(),
      allowCacheBrowserLocalDay: "2026-05-16",
    };

    const popupStatus = getBlockedSiteStatusViewModel(state, createLocalDate(2026, 4, 16, 10, 15));

    expect(popupStatus.title).toBe("Allowed Today");
    expect(popupStatus.nextRelevantValue).toContain("23:00");
    expect(popupStatus.lastAcceptedSolveValue).toBe("2026-05-16 08:30");
  });

  it("renders verification failed when LeetCode verification fails", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "verificationFailed",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 8, 30).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    const popupStatus = getBlockedSiteStatusViewModel(state, createLocalDate(2026, 4, 16, 10, 15));

    expect(popupStatus.title).toBe("Verification failed");
    expect(popupStatus.nextRelevantValue).toContain("Check now");
    expect(popupStatus.lastAcceptedSolveValue).toBe("2026-05-15 08:30");
  });

  it("maps verification failed to daily solve gate blocking for blocked-site access", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "verificationFailed",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 8, 30).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    expect(getBlockedSiteAccessDecision(state, createLocalDate(2026, 4, 16, 10, 15))).toEqual({
      kind: "block",
      reason: "blockedByDailySolveGate",
      status: "verificationFailed",
    });
  });

  it("returns null when there is no accepted solve timestamp", () => {
    expect(formatAcceptedSolveTimestamp(null)).toBeNull();
  });
});
