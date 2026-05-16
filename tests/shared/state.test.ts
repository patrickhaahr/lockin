import { describe, expect, it } from "vitest";
import {
  DEFAULT_BLOCKED_ROOTS,
  createConfiguredState,
  createEmptyExtensionState,
  isSetupRequired,
  normalizeExtensionState,
} from "../../src/shared/state";

describe("shared extension state", () => {
  it("starts in setup mode without saved config", () => {
    const state = createEmptyExtensionState();

    expect(state.currentConfig).toBeNull();
    expect(isSetupRequired(state)).toBe(true);
  });

  it("creates configured state with default blocked roots", () => {
    const state = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });

    expect(isSetupRequired(state)).toBe(false);
    expect(state.blockedRoots.active).toEqual([...DEFAULT_BLOCKED_ROOTS]);
    expect(state.pendingConfig).toBeNull();
    expect(state.verification.kind).toBe("idle");
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
});
