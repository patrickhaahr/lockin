import { describe, expect, it } from "vitest";
import {
  addBlockedRoot,
  DEFAULT_BLOCKED_ROOTS,
  createConfiguredState,
  createEmptyExtensionState,
  formatHardLockWindow,
  getActiveBlockedRootForHostname,
  getProtectedSettingsChangeAvailability,
  isWithinHardLockWindow,
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

function expectUpdatedProtectedSettingsState(
  result: ReturnType<typeof savePendingProtectedSettings>,
) {
  expect(result.kind).toBe("updated");
  if (result.kind !== "updated") {
    throw new Error("Expected protected settings save to succeed.");
  }

  return result.state;
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
    expect(state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay).toBeNull();
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
    expect(state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay).toBeNull();
    expect(state.verification.kind).toBe("allowedToday");
    expect(state.verification.lastAcceptedSolveAt).toBeNull();
    expect(state.verification.allowCacheBrowserLocalDay).toBeNull();
  });

  it("treats equal hard-lock times as a full-day lock window", () => {
    expect(
      isWithinHardLockWindow(
        {
          start: "08:30",
          end: "08:30",
        },
        new Date(2026, 4, 16, 14, 15, 0),
      ),
    ).toBe(true);
  });

  it("treats overnight hard-lock windows as blocking before the end time", () => {
    expect(
      isWithinHardLockWindow(
        {
          start: "23:00",
          end: "09:00",
        },
        new Date(2026, 4, 16, 7, 30, 0),
      ),
    ).toBe(true);

    expect(
      isWithinHardLockWindow(
        {
          start: "23:00",
          end: "09:00",
        },
        new Date(2026, 4, 16, 14, 30, 0),
      ),
    ).toBe(false);
  });

  it("normalizes blocked roots from bare domains and urls", () => {
    expect(normalizeBlockedRoot("  X.COM ")).toBe("x.com");
    expect(normalizeBlockedRoot("https://mobile.twitter.com/home")).toBe("twitter.com");
    expect(normalizeBlockedRoot("https://foo.github.io/path")).toBe("foo.github.io");
    expect(normalizeBlockedRoot("not a domain")).toBeNull();
  });

  it("matches blocked roots against subdomains of active roots", () => {
    const state = createConfiguredTestState();

    expect(getActiveBlockedRootForHostname(state.blockedRoots, "mobile.twitter.com")).toBe(
      "twitter.com",
    );
    expect(getActiveBlockedRootForHostname(state.blockedRoots, "api.x.com")).toBe("x.com");
    expect(getActiveBlockedRootForHostname(state.blockedRoots, "leetcode.com")).toBeNull();
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
    const result = expectUpdatedProtectedSettingsState(
      savePendingProtectedSettings(
        createConfiguredTestState(),
        PENDING_PROTECTED_SETTINGS,
        new Date("2026-05-16T12:00:00"),
      ),
    );

    expect(result.currentConfig).toEqual(ACTIVE_PROTECTED_SETTINGS);
    expect(result.pendingConfig).toEqual(PENDING_PROTECTED_SETTINGS);
    expect(result.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay).toBe("2026-05-16");
  });

  it("keeps an existing pending protected change when the same pending values are saved again", () => {
    const pendingState = expectUpdatedProtectedSettingsState(
      savePendingProtectedSettings(
        createConfiguredTestState(),
        PENDING_PROTECTED_SETTINGS,
        new Date("2026-05-16T12:00:00"),
      ),
    );

    const unchangedResult = savePendingProtectedSettings(
      pendingState,
      PENDING_PROTECTED_SETTINGS,
      new Date("2026-05-16T12:30:00"),
    );

    expect(unchangedResult).toEqual({
      kind: "unchanged",
    });
  });

  it("blocks canceling a pending protected change until the next browser-local day", () => {
    const pendingState = expectUpdatedProtectedSettingsState(
      savePendingProtectedSettings(
        createConfiguredTestState(),
        PENDING_PROTECTED_SETTINGS,
        new Date("2026-05-16T12:00:00"),
      ),
    );

    const lockedCancelResult = savePendingProtectedSettings(
      pendingState,
      ACTIVE_PROTECTED_SETTINGS,
      new Date("2026-05-16T18:00:00"),
    );

    expect(lockedCancelResult).toEqual({
      kind: "locked",
      nextChangeAvailableOnBrowserLocalDay: "2026-05-17",
    });
  });

  it("allows canceling a pending protected change on the next browser-local day", () => {
    const pendingState = expectUpdatedProtectedSettingsState(
      savePendingProtectedSettings(
        createConfiguredTestState(),
        PENDING_PROTECTED_SETTINGS,
        new Date("2026-05-16T12:00:00"),
      ),
    );

    const canceledState = expectUpdatedProtectedSettingsState(
      savePendingProtectedSettings(
        pendingState,
        ACTIVE_PROTECTED_SETTINGS,
        new Date("2026-05-17T08:00:00"),
      ),
    );

    expect(canceledState.pendingConfig).toBeNull();
    expect(canceledState.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay).toBe(
      "2026-05-17",
    );
  });

  it("does not consume the daily protected-settings change allowance during first-run setup", () => {
    const state = createConfiguredState(PENDING_PROTECTED_SETTINGS);

    expect(state.pendingConfig).toBeNull();
    expect(state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay).toBeNull();
  });

  it("does not consume the daily protected-settings change allowance for unchanged saves", () => {
    const result = savePendingProtectedSettings(
      createConfiguredTestState(),
      ACTIVE_PROTECTED_SETTINGS,
      new Date("2026-05-16T12:00:00"),
    );

    expect(result).toEqual({
      kind: "unchanged",
    });
  });

  it("blocks further protected-setting edits until the next browser-local day", () => {
    const firstSaveState = expectUpdatedProtectedSettingsState(
      savePendingProtectedSettings(
        createConfiguredTestState(),
        PENDING_PROTECTED_SETTINGS,
        new Date("2026-05-16T12:00:00"),
      ),
    );

    const secondSaveResult = savePendingProtectedSettings(
      firstSaveState,
      {
        trackedProfile: "third-user",
        hardLockWindow: {
          start: "21:00",
          end: "07:00",
        },
      },
      new Date("2026-05-16T20:00:00"),
    );

    expect(secondSaveResult).toEqual({
      kind: "locked",
      nextChangeAvailableOnBrowserLocalDay: "2026-05-17",
    });
  });

  it("shows the next protected-settings change after the browser-local day rolls over", () => {
    const pendingState = expectUpdatedProtectedSettingsState(
      savePendingProtectedSettings(
        createConfiguredTestState(),
        PENDING_PROTECTED_SETTINGS,
        new Date("2026-05-16T12:00:00"),
      ),
    );

    expect(
      getProtectedSettingsChangeAvailability(pendingState, new Date("2026-05-16T18:00:00")),
    ).toEqual({
      isLocked: true,
      nextChangeAvailableOnBrowserLocalDay: "2026-05-17",
    });

    expect(
      getProtectedSettingsChangeAvailability(pendingState, new Date("2026-05-17T08:00:00")),
    ).toEqual({
      isLocked: false,
      nextChangeAvailableOnBrowserLocalDay: null,
    });
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
