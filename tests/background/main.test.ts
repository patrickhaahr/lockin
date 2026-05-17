import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConfiguredState } from "../../src/shared/state";

type ChromeStub = {
  alarms: {
    onAlarm: {
      addListener: ReturnType<typeof vi.fn>;
    };
  };
  runtime: {
    onInstalled: {
      addListener: ReturnType<typeof vi.fn>;
    };
    onMessage: {
      addListener: ReturnType<typeof vi.fn>;
    };
    onStartup: {
      addListener: ReturnType<typeof vi.fn>;
    };
  };
  storage: {
    onChanged: {
      addListener: ReturnType<typeof vi.fn>;
    };
  };
};

const ensureExtensionState = vi.fn();
const readExtensionState = vi.fn();
const writeExtensionState = vi.fn();
const writeVerificationStatus = vi.fn();
const scheduleTransitionAlarms = vi.fn();
const reevaluateOpenTabs = vi.fn();

vi.mock("../../src/shared/storage", () => ({
  ensureExtensionState,
  readExtensionState,
  writeExtensionState,
  writeVerificationStatus,
}));

vi.mock("../../src/background/alarm-scheduler", () => ({
  BROWSER_LOCAL_MIDNIGHT_ALARM_NAME: "lockIn.browserLocalMidnight",
  HARD_LOCK_START_ALARM_NAME: "lockIn.hardLockStart",
  HARD_LOCK_END_ALARM_NAME: "lockIn.hardLockEnd",
  isTransitionAlarmName: (name: string) => name.startsWith("lockIn."),
  scheduleTransitionAlarms,
}));

vi.mock("../../src/background/open-tab-reevaluation", () => ({
  reevaluateOpenTabs,
}));

describe("background transition handling", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureExtensionState.mockReset();
    readExtensionState.mockReset();
    writeExtensionState.mockReset();
    writeVerificationStatus.mockReset();
    scheduleTransitionAlarms.mockReset();
    reevaluateOpenTabs.mockReset();

    (globalThis as typeof globalThis & { chrome: ChromeStub }).chrome = {
      alarms: {
        onAlarm: {
          addListener: vi.fn(),
        },
      },
      runtime: {
        onInstalled: {
          addListener: vi.fn(),
        },
        onMessage: {
          addListener: vi.fn(),
        },
        onStartup: {
          addListener: vi.fn(),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn(),
        },
      },
    };
  });

  it("initializes state and schedules alarms", async () => {
    const state = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });
    ensureExtensionState.mockResolvedValue(state);

    const { initializeBackgroundState } = await import("../../src/background/main");

    await initializeBackgroundState();

    expect(ensureExtensionState).toHaveBeenCalledTimes(1);
    expect(writeExtensionState).toHaveBeenCalledWith({
      ...state,
      lastProcessedBrowserLocalDay: expect.any(String),
    });
    expect(writeVerificationStatus).toHaveBeenCalledWith(state.verification);
    expect(scheduleTransitionAlarms).toHaveBeenCalledWith({
      ...state,
      lastProcessedBrowserLocalDay: expect.any(String),
    });
    expect(reevaluateOpenTabs).not.toHaveBeenCalled();
  });

  it("applies the browser-local day transition at midnight and reevaluates open tabs", async () => {
    const state = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });
    state.pendingConfig = {
      trackedProfile: "next-user",
      hardLockWindow: {
        start: "22:00",
        end: "08:00",
      },
    };
    state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay = "2026-05-16";
    state.blockedRoots.pendingRemoval = ["twitter.com"];
    state.blockedRoots.pendingRemovalScheduledOnBrowserLocalDay = "2026-05-16";
    state.verification = {
      kind: "allowedToday",
      checkedAt: "2026-05-16T10:00:00.000Z",
      lastAcceptedSolveAt: "2026-05-16T09:59:00.000Z",
      allowCacheBrowserLocalDay: "2026-05-16",
    };
    state.lastProcessedBrowserLocalDay = "2026-05-16";
    readExtensionState.mockResolvedValue(state);

    const { handleTransitionAlarm } = await import("../../src/background/main");

    await handleTransitionAlarm("lockIn.browserLocalMidnight");

    expect(writeExtensionState).toHaveBeenCalledWith(
      expect.objectContaining({
        currentConfig: state.pendingConfig,
        pendingConfig: null,
        blockedRoots: {
          active: ["x.com"],
          pendingRemoval: [],
          pendingRemovalScheduledOnBrowserLocalDay: null,
        },
        lastProcessedBrowserLocalDay: expect.any(String),
        verification: expect.objectContaining({
          allowCacheBrowserLocalDay: null,
        }),
      }),
    );
    expect(writeVerificationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        allowCacheBrowserLocalDay: null,
      }),
    );
    expect(scheduleTransitionAlarms).toHaveBeenCalledTimes(1);
    expect(reevaluateOpenTabs).toHaveBeenCalledWith(
      expect.objectContaining({
        lastProcessedBrowserLocalDay: expect.any(String),
      }),
      state,
    );
  });

  it("reevaluates open tabs on hard-lock boundary alarms without rewriting state", async () => {
    const state = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });
    readExtensionState.mockResolvedValue(state);

    const { handleTransitionAlarm } = await import("../../src/background/main");

    await handleTransitionAlarm("lockIn.hardLockStart");

    expect(writeExtensionState).toHaveBeenCalledWith({
      ...state,
      lastProcessedBrowserLocalDay: expect.any(String),
    });
    expect(writeVerificationStatus).toHaveBeenCalledWith(state.verification);
    expect(scheduleTransitionAlarms).toHaveBeenCalledWith({
      ...state,
      lastProcessedBrowserLocalDay: expect.any(String),
    });
    expect(reevaluateOpenTabs).toHaveBeenCalledWith(
      {
        ...state,
        lastProcessedBrowserLocalDay: expect.any(String),
      },
      state,
    );
  });

  it("reconciles browser-local day state before a hard-lock alarm that fires at midnight", async () => {
    const state = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "00:00",
        end: "09:00",
      },
    });
    state.pendingConfig = {
      trackedProfile: "next-user",
      hardLockWindow: {
        start: "23:30",
        end: "08:30",
      },
    };
    state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay = "2026-05-16";
    state.lastProcessedBrowserLocalDay = "2026-05-16";
    readExtensionState.mockResolvedValue(state);

    const { handleTransitionAlarm } = await import("../../src/background/main");

    await handleTransitionAlarm("lockIn.hardLockStart");

    expect(writeExtensionState).toHaveBeenCalledWith(
      expect.objectContaining({
        currentConfig: state.pendingConfig,
        pendingConfig: null,
      }),
    );
    expect(reevaluateOpenTabs).toHaveBeenCalledWith(
      expect.objectContaining({
        currentConfig: state.pendingConfig,
        pendingConfig: null,
      }),
      state,
    );
  });

  it("applies a missed browser-local day transition during startup", async () => {
    const state = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });
    state.pendingConfig = {
      trackedProfile: "next-user",
      hardLockWindow: {
        start: "22:00",
        end: "08:00",
      },
    };
    state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay = "2026-05-16";
    state.blockedRoots.pendingRemoval = ["twitter.com"];
    state.blockedRoots.pendingRemovalScheduledOnBrowserLocalDay = "2026-05-16";
    state.lastProcessedBrowserLocalDay = "2026-05-16";
    ensureExtensionState.mockResolvedValue(state);

    const { initializeBackgroundState } = await import("../../src/background/main");

    await initializeBackgroundState();

    expect(writeExtensionState).toHaveBeenCalledWith(
      expect.objectContaining({
        currentConfig: state.pendingConfig,
        pendingConfig: null,
        blockedRoots: {
          active: ["x.com"],
          pendingRemoval: [],
          pendingRemovalScheduledOnBrowserLocalDay: null,
        },
      }),
    );
    expect(reevaluateOpenTabs).toHaveBeenCalledWith(
      expect.objectContaining({
        currentConfig: state.pendingConfig,
      }),
      state,
    );
  });
});
