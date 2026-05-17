import {
  ensureExtensionState,
  readExtensionState,
  writeExtensionState,
  writeVerificationStatus,
} from "@/shared/storage";
import { MANUAL_VERIFICATION_DEBOUNCE_MS } from "@/shared/constants";
import { synchronizeBrowserLocalDayState } from "@/shared/state-transitions";
import {
  runDailySolveGateVerification,
  VERIFY_DAILY_SOLVE_GATE_MESSAGE_TYPE,
  type VerifyDailySolveGateRequest,
  type VerifyDailySolveGateResponse,
} from "@/shared/verification";
import {
  BROWSER_LOCAL_MIDNIGHT_ALARM_NAME,
  isTransitionAlarmName,
  scheduleTransitionAlarms,
} from "./alarm-scheduler";
import { createManualVerificationScheduler } from "./manual-verification-scheduler";
import { reevaluateOpenTabs } from "./open-tab-reevaluation";

const EXTENSION_STATE_KEY = "lockInState";

const manualVerificationScheduler = createManualVerificationScheduler(
  runVerificationAgainstLatestState,
  {
    cooldownMs: MANUAL_VERIFICATION_DEBOUNCE_MS,
  },
);

function initializeBackground(): void {
  void initializeBackgroundState();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isVerifyDailySolveGateRequest(message)) {
    return false;
  }

  void handleVerifyDailySolveGateMessage(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(initializeBackground);
chrome.runtime.onStartup.addListener(initializeBackground);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!isTransitionAlarmName(alarm.name)) {
    return;
  }

  void handleTransitionAlarm(alarm.name);
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (!didCurrentConfigChange(changes[EXTENSION_STATE_KEY])) {
    return;
  }

  void syncTransitionAlarms();
});

export async function initializeBackgroundState(): Promise<void> {
  const initialState = await ensureExtensionState();
  const synchronizationResult = synchronizeBrowserLocalDayState(initialState);
  const state = synchronizationResult.state;

  if (synchronizationResult.didChange) {
    await writeExtensionState(state);
    await writeVerificationStatus(state.verification);

    if (synchronizationResult.didApplyTransition) {
      await reevaluateOpenTabs(state, initialState);
    }
  }

  await scheduleTransitionAlarms(state);
}

export async function syncTransitionAlarms(): Promise<void> {
  const state = await readExtensionState();
  await scheduleTransitionAlarms(state);
}

export async function handleTransitionAlarm(alarmName: string): Promise<void> {
  const state = await readExtensionState();
  const synchronizationResult = synchronizeBrowserLocalDayState(state);
  const nextState = synchronizationResult.state;

  if (alarmName === BROWSER_LOCAL_MIDNIGHT_ALARM_NAME || synchronizationResult.didChange) {
    await writeExtensionState(nextState);
    await writeVerificationStatus(nextState.verification);
  }

  await scheduleTransitionAlarms(nextState);
  await reevaluateOpenTabs(nextState, state);
}

async function handleVerifyDailySolveGateMessage(
  sendResponse: (response: VerifyDailySolveGateResponse) => void,
): Promise<void> {
  const response = await manualVerificationScheduler.request();
  sendResponse(response);
}

function isVerifyDailySolveGateRequest(message: unknown): message is VerifyDailySolveGateRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === VERIFY_DAILY_SOLVE_GATE_MESSAGE_TYPE
  );
}

async function runVerificationAgainstLatestState(): Promise<VerifyDailySolveGateResponse> {
  const currentState = await readExtensionState();
  const verificationResult = await runDailySolveGateVerification(currentState);
  const verification = verificationResult.nextState.verification;

  await writeVerificationStatus(verification);

  return {
    verification,
    usedCache: verificationResult.usedCache,
  };
}

function didCurrentConfigChange(storageChange: chrome.storage.StorageChange | undefined): boolean {
  if (storageChange === undefined) {
    return false;
  }

  return (
    JSON.stringify(readCurrentConfig(storageChange.oldValue)) !==
    JSON.stringify(readCurrentConfig(storageChange.newValue))
  );
}

function readCurrentConfig(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("currentConfig" in value)) {
    return null;
  }

  return value.currentConfig;
}
