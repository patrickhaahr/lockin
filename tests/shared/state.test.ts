import { describe, expect, it } from "vitest";
import {
  addBlockedRoot,
  DEFAULT_BLOCKED_ROOTS,
  createConfiguredState,
  createEmptyExtensionState,
  formatHardLockWindow,
  isSetupRequired,
  normalizeBlockedRoot,
  normalizeExtensionState,
  savePendingProtectedSettings,
  scheduleBlockedRootRemoval,
} from "../../src/shared/state";

const ACTIVE_PROTECTED_SETTINGS = {
  trackedProfile: "lockin-user",
  hardLockWindow: {
    start: "23:00",
    end: "09:00",
  },
} as const;

const PENDING_PROTECTED_SETTINGS = {
  trackedProfile: "next-user",
  hardLockWindow: {
    start: "22:00",
    end: "08:00",
  },
} as const;

function createConfiguredTestState() {
  return createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
}

describe("shared extension state", () => {
  it("starts in setup mode without saved config", () => {
    const state = createEmptyExtensionState();

    expect(state.currentConfig).toBeNull();
    expect(isSetupRequired(state)).toBe(true);
  });

  it("creates configured state with default blocked roots", () => {
    const state = createConfiguredTestState();

    expect(isSetupRequired(state)).toBe(false);
    expect(state.blockedRoots.active).toEqual([...DEFAULT_BLOCKED_ROOTS]);
    expect(state.pendingConfig).toBeNull();
    expect(state.verification.kind).toBe("idle");
  });

  it("formats equal hard-lock times as a full-day lock", () => {
    expect(
      formatHardLockWindow({
        start: "08:30",
        end: "08:30",
      }),
    ).toBe("Full-day lock (08:30 - 08:30)");
  });

  it("normalizes incomplete stored state into a safe shape", () => {
    const state = normalizeExtensionState({
      currentConfig: {
        trackedProfile: "lockin-user",
        hardLockWindow: {
          start: "23:00",
          end: "09:00",
        },
      },
      blockedRoots: {
        active: ["twitter.com"],
      },
      verification: {
        kind: "allowedToday",
        checkedAt: "2026-05-16T12:00:00.000Z",
      },
    });

    expect(state.currentConfig?.trackedProfile).toBe("lockin-user");
    expect(state.blockedRoots.active).toEqual(["twitter.com"]);
    expect(state.blockedRoots.pendingRemoval).toEqual([]);
    expect(state.verification.kind).toBe("allowedToday");
    expect(state.verification.lastAcceptedSolveAt).toBeNull();
  });

  it("normalizes blocked roots from bare domains and urls", () => {
    expect(normalizeBlockedRoot("  X.COM ")).toBe("x.com");
    expect(normalizeBlockedRoot("https://mobile.twitter.com/home")).toBe("twitter.com");
    expect(normalizeBlockedRoot("https://foo.github.io/path")).toBe("foo.github.io");
    expect(normalizeBlockedRoot("not a domain")).toBeNull();
  });

  it("adds a normalized blocked root immediately", () => {
    const result = addBlockedRoot(
      createConfiguredTestState(),
      "https://www.youtube.com/watch?v=test",
    );

    expect(result.kind).toBe("updated");
    if (result.kind !== "updated") {
      throw new Error("Expected blocked root add to succeed.");
    }

    expect(result.state.blockedRoots.active).toEqual(["twitter.com", "x.com", "youtube.com"]);
    expect(result.state.blockedRoots.pendingRemoval).toEqual([]);
  });

  it("rejects redundant blocked roots across active and pending state", () => {
    const state = createConfiguredTestState();
    const pendingRemovalState = scheduleBlockedRootRemoval(state, "twitter.com");

    expect(addBlockedRoot(state, "mobile.twitter.com").kind).toBe("duplicate");
    expect(pendingRemovalState).not.toBeNull();
    if (pendingRemovalState === null) {
      throw new Error("Expected blocked root removal scheduling to succeed.");
    }

    expect(addBlockedRoot(pendingRemovalState, "https://x.com/home").kind).toBe("duplicate");
  });

  it("schedules blocked root removals for the next day", () => {
    const nextState = scheduleBlockedRootRemoval(createConfiguredTestState(), "twitter.com");

    expect(nextState).not.toBeNull();
    expect(nextState?.blockedRoots.active).toEqual(["twitter.com", "x.com"]);
    expect(nextState?.blockedRoots.pendingRemoval).toEqual(["twitter.com"]);
  });

  it("saves later protected-setting edits as pending for tomorrow", () => {
    const nextState = savePendingProtectedSettings(
      createConfiguredTestState(),
      PENDING_PROTECTED_SETTINGS,
    );

    expect(nextState).not.toBeNull();
    expect(nextState?.currentConfig).toEqual(ACTIVE_PROTECTED_SETTINGS);
    expect(nextState?.pendingConfig).toEqual(PENDING_PROTECTED_SETTINGS);
  });

  it("keeps an existing pending protected change when the active values are saved again", () => {
    const pendingState = savePendingProtectedSettings(
      createConfiguredTestState(),
      PENDING_PROTECTED_SETTINGS,
    );

    expect(pendingState).not.toBeNull();
    if (pendingState === null) {
      throw new Error("Expected pending protected settings to be created.");
    }

    const unchangedState = savePendingProtectedSettings(pendingState, ACTIVE_PROTECTED_SETTINGS);

    expect(unchangedState).toBeNull();
  });

  it("cancels a pending blocked root removal when the root is re-added", () => {
    const state = createConfiguredTestState();
    const pendingRemovalState = scheduleBlockedRootRemoval(state, "twitter.com");

    expect(pendingRemovalState).not.toBeNull();
    if (pendingRemovalState === null) {
      throw new Error("Expected blocked root removal scheduling to succeed.");
    }

    const result = addBlockedRoot(pendingRemovalState, "https://mobile.twitter.com/home");

    expect(result.kind).toBe("updated");
    if (result.kind !== "updated") {
      throw new Error("Expected re-adding a pending removal root to succeed.");
    }

    expect(result.state.blockedRoots.active).toEqual(["twitter.com", "x.com"]);
    expect(result.state.blockedRoots.pendingRemoval).toEqual([]);
  });
});
