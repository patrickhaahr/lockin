import { describe, expect, it, vi } from "vitest";
import {
  BROWSER_LOCAL_MIDNIGHT_ALARM_NAME,
  HARD_LOCK_END_ALARM_NAME,
  HARD_LOCK_START_ALARM_NAME,
  getTransitionAlarmDefinitions,
  isTransitionAlarmName,
  scheduleTransitionAlarms,
} from "../../src/background/alarm-scheduler";
import { createConfiguredState } from "../../src/shared/state";

type AlarmCreateInfo = {
  when?: number;
};

const ACTIVE_PROTECTED_SETTINGS = {
  trackedProfile: "lockin-user",
  hardLockWindow: {
    start: "23:00",
    end: "09:00",
  },
} as const;

describe("alarm scheduler", () => {
  it("schedules midnight and both hard-lock boundary alarms", () => {
    const definitions = getTransitionAlarmDefinitions(
      createConfiguredState(ACTIVE_PROTECTED_SETTINGS),
      new Date(2026, 4, 16, 7, 30, 0, 0),
    );

    expect(definitions).toEqual([
      {
        name: BROWSER_LOCAL_MIDNIGHT_ALARM_NAME,
        when: new Date(2026, 4, 17, 0, 0, 0, 0).getTime(),
      },
      {
        name: HARD_LOCK_START_ALARM_NAME,
        when: new Date(2026, 4, 16, 23, 0, 0, 0).getTime(),
      },
      {
        name: HARD_LOCK_END_ALARM_NAME,
        when: new Date(2026, 4, 16, 9, 0, 0, 0).getTime(),
      },
    ]);
  });

  it("schedules only midnight for a full-day hard lock", () => {
    const definitions = getTransitionAlarmDefinitions(
      createConfiguredState({
        trackedProfile: "lockin-user",
        hardLockWindow: {
          start: "08:30",
          end: "08:30",
        },
      }),
      new Date(2026, 4, 16, 7, 30, 0, 0),
    );

    expect(definitions).toEqual([
      {
        name: BROWSER_LOCAL_MIDNIGHT_ALARM_NAME,
        when: new Date(2026, 4, 17, 0, 0, 0, 0).getTime(),
      },
    ]);
  });

  it("clears and recreates alarms from the active schedule", async () => {
    const clearAll = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const create = vi.fn<(name: string, info: AlarmCreateInfo) => void>();

    await scheduleTransitionAlarms(
      createConfiguredState(ACTIVE_PROTECTED_SETTINGS),
      {
        clearAll,
        create,
      },
      new Date(2026, 4, 16, 7, 30, 0, 0),
    );

    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(3);
    expect(isTransitionAlarmName(BROWSER_LOCAL_MIDNIGHT_ALARM_NAME)).toBe(true);
    expect(isTransitionAlarmName("lockIn.other")).toBe(false);
  });
});
