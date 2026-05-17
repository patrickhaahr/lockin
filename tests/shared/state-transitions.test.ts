import { describe, expect, it } from "vitest";
import {
  createConfiguredState,
  savePendingProtectedSettings,
  scheduleBlockedRootRemoval,
} from "../../src/shared/state";
import {
  applyBrowserLocalDayTransition,
  synchronizeBrowserLocalDayState,
} from "../../src/shared/state-transitions";

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

describe("browser-local day transition", () => {
  it("activates pending config, removes pending blocked roots, and clears the allow cache", () => {
    const initialState = createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
    const pendingProtectedSettingsResult = savePendingProtectedSettings(
      initialState,
      PENDING_PROTECTED_SETTINGS,
      new Date("2026-05-16T12:00:00"),
    );

    expect(pendingProtectedSettingsResult.kind).toBe("updated");
    if (pendingProtectedSettingsResult.kind !== "updated") {
      throw new Error("Expected pending protected settings to save.");
    }

    const withPendingRemoval = scheduleBlockedRootRemoval(
      pendingProtectedSettingsResult.state,
      "twitter.com",
      new Date("2026-05-16T12:00:00"),
    );

    expect(withPendingRemoval).not.toBeNull();
    if (withPendingRemoval === null) {
      throw new Error("Expected pending blocked root removal to save.");
    }

    withPendingRemoval.verification = {
      kind: "allowedToday",
      checkedAt: "2026-05-16T10:00:00.000Z",
      lastAcceptedSolveAt: "2026-05-16T09:59:00.000Z",
      allowCacheBrowserLocalDay: "2026-05-16",
    };
    withPendingRemoval.lastProcessedBrowserLocalDay = "2026-05-16";

    expect(applyBrowserLocalDayTransition(withPendingRemoval, "2026-05-17")).toEqual({
      ...withPendingRemoval,
      currentConfig: PENDING_PROTECTED_SETTINGS,
      pendingConfig: null,
      blockedRoots: {
        active: ["x.com"],
        pendingRemoval: [],
        pendingRemovalScheduledOnBrowserLocalDay: null,
      },
      lastProcessedBrowserLocalDay: "2026-05-17",
      verification: {
        kind: "allowedToday",
        checkedAt: "2026-05-16T10:00:00.000Z",
        lastAcceptedSolveAt: "2026-05-16T09:59:00.000Z",
        allowCacheBrowserLocalDay: null,
      },
    });
  });

  it("marks the current browser-local day on first startup without forcing a transition", () => {
    const state = createConfiguredState(ACTIVE_PROTECTED_SETTINGS);

    expect(synchronizeBrowserLocalDayState(state, new Date("2026-05-16T07:30:00"))).toEqual({
      didChange: true,
      didApplyTransition: false,
      state: {
        ...state,
        lastProcessedBrowserLocalDay: "2026-05-16",
      },
    });
  });

  it("does not activate same-day pending blocked-root removals during upgrade bookkeeping", () => {
    const state = createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
    const withPendingRemoval = scheduleBlockedRootRemoval(
      state,
      "twitter.com",
      new Date("2026-05-16T12:00:00"),
    );

    expect(withPendingRemoval).not.toBeNull();
    if (withPendingRemoval === null) {
      throw new Error("Expected pending blocked root removal to save.");
    }

    expect(
      synchronizeBrowserLocalDayState(withPendingRemoval, new Date("2026-05-16T18:00:00")),
    ).toEqual({
      didChange: true,
      didApplyTransition: false,
      state: {
        ...withPendingRemoval,
        lastProcessedBrowserLocalDay: "2026-05-16",
      },
    });
  });

  it("does not activate legacy pending blocked-root removals without schedule metadata", () => {
    const state = createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
    state.blockedRoots.pendingRemoval = ["twitter.com"];

    expect(synchronizeBrowserLocalDayState(state, new Date("2026-05-16T18:00:00"))).toEqual({
      didChange: true,
      didApplyTransition: false,
      state: {
        ...state,
        lastProcessedBrowserLocalDay: "2026-05-16",
      },
    });
  });

  it("does not activate same-day pending protected settings during upgrade bookkeeping", () => {
    const state = createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
    const pendingProtectedSettingsResult = savePendingProtectedSettings(
      state,
      PENDING_PROTECTED_SETTINGS,
      new Date("2026-05-16T12:00:00"),
    );

    expect(pendingProtectedSettingsResult.kind).toBe("updated");
    if (pendingProtectedSettingsResult.kind !== "updated") {
      throw new Error("Expected pending protected settings to save.");
    }

    expect(
      synchronizeBrowserLocalDayState(
        pendingProtectedSettingsResult.state,
        new Date("2026-05-16T18:00:00"),
      ),
    ).toEqual({
      didChange: true,
      didApplyTransition: false,
      state: {
        ...pendingProtectedSettingsResult.state,
        lastProcessedBrowserLocalDay: "2026-05-16",
      },
    });
  });

  it("clears a stale allow cache without activating same-day pending changes on upgrade", () => {
    const state = createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
    const pendingProtectedSettingsResult = savePendingProtectedSettings(
      state,
      PENDING_PROTECTED_SETTINGS,
      new Date("2026-05-16T12:00:00"),
    );

    expect(pendingProtectedSettingsResult.kind).toBe("updated");
    if (pendingProtectedSettingsResult.kind !== "updated") {
      throw new Error("Expected pending protected settings to save.");
    }

    const withPendingRemoval = scheduleBlockedRootRemoval(
      pendingProtectedSettingsResult.state,
      "twitter.com",
      new Date("2026-05-16T12:30:00"),
    );

    expect(withPendingRemoval).not.toBeNull();
    if (withPendingRemoval === null) {
      throw new Error("Expected pending blocked root removal to save.");
    }

    withPendingRemoval.verification = {
      kind: "allowedToday",
      checkedAt: "2026-05-15T10:00:00.000Z",
      lastAcceptedSolveAt: "2026-05-15T09:59:00.000Z",
      allowCacheBrowserLocalDay: "2026-05-15",
    };

    expect(
      synchronizeBrowserLocalDayState(withPendingRemoval, new Date("2026-05-16T18:00:00")),
    ).toEqual({
      didChange: true,
      didApplyTransition: true,
      state: {
        ...withPendingRemoval,
        lastProcessedBrowserLocalDay: "2026-05-16",
        verification: {
          kind: "allowedToday",
          checkedAt: "2026-05-15T10:00:00.000Z",
          lastAcceptedSolveAt: "2026-05-15T09:59:00.000Z",
          allowCacheBrowserLocalDay: null,
        },
      },
    });
  });
});
