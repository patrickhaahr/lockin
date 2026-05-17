import { isFullDayHardLockWindow, parseClockTime } from "@/shared/state";
import type { ExtensionState } from "@/shared/types";

export const HARD_LOCK_START_ALARM_NAME = "lockIn.hardLockStart";
export const HARD_LOCK_END_ALARM_NAME = "lockIn.hardLockEnd";
export const BROWSER_LOCAL_MIDNIGHT_ALARM_NAME = "lockIn.browserLocalMidnight";

type AlarmDefinition = {
  name: string;
  when: number;
};

type AlarmApi = Pick<typeof chrome.alarms, "clearAll" | "create">;

export function getTransitionAlarmDefinitions(
  state: ExtensionState,
  now: Date = new Date(),
): AlarmDefinition[] {
  const definitions: AlarmDefinition[] = [
    {
      name: BROWSER_LOCAL_MIDNIGHT_ALARM_NAME,
      when: getNextBrowserLocalMidnight(now).getTime(),
    },
  ];

  if (state.currentConfig === null || isFullDayHardLockWindow(state.currentConfig.hardLockWindow)) {
    return definitions;
  }

  const nextHardLockStart = getNextClockTimeOccurrence(
    state.currentConfig.hardLockWindow.start,
    now,
  );
  const nextHardLockEnd = getNextClockTimeOccurrence(state.currentConfig.hardLockWindow.end, now);

  if (nextHardLockStart !== null) {
    definitions.push({
      name: HARD_LOCK_START_ALARM_NAME,
      when: nextHardLockStart.getTime(),
    });
  }

  if (nextHardLockEnd !== null) {
    definitions.push({
      name: HARD_LOCK_END_ALARM_NAME,
      when: nextHardLockEnd.getTime(),
    });
  }

  return definitions;
}

export async function scheduleTransitionAlarms(
  state: ExtensionState,
  alarmsApi: AlarmApi = chrome.alarms,
  now: Date = new Date(),
): Promise<void> {
  await alarmsApi.clearAll();

  for (const alarm of getTransitionAlarmDefinitions(state, now)) {
    void alarmsApi.create(alarm.name, {
      when: alarm.when,
    });
  }
}

export function isTransitionAlarmName(alarmName: string): boolean {
  return (
    alarmName === HARD_LOCK_START_ALARM_NAME ||
    alarmName === HARD_LOCK_END_ALARM_NAME ||
    alarmName === BROWSER_LOCAL_MIDNIGHT_ALARM_NAME
  );
}

function getNextBrowserLocalMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

function getNextClockTimeOccurrence(clockTime: string, now: Date): Date | null {
  const parsedClockTime = parseClockTime(clockTime);

  if (parsedClockTime === null) {
    return null;
  }

  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    parsedClockTime.hours,
    parsedClockTime.minutes,
    0,
    0,
  );

  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate;
}
