import {
  ensureExtensionState,
  readExtensionState,
  writeVerificationStatus,
} from "@/shared/storage";
import { MANUAL_VERIFICATION_DEBOUNCE_MS } from "@/shared/constants";
import {
  runDailySolveGateVerification,
  VERIFY_DAILY_SOLVE_GATE_MESSAGE_TYPE,
  type VerifyDailySolveGateRequest,
  type VerifyDailySolveGateResponse,
} from "@/shared/verification";
import { createManualVerificationScheduler } from "./manual-verification-scheduler";

const manualVerificationScheduler = createManualVerificationScheduler(
  runVerificationAgainstLatestState,
  {
    cooldownMs: MANUAL_VERIFICATION_DEBOUNCE_MS,
  },
);

function initializeExtensionState(): void {
  void ensureExtensionState();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isVerifyDailySolveGateRequest(message)) {
    return false;
  }

  void handleVerifyDailySolveGateMessage(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(initializeExtensionState);
chrome.runtime.onStartup.addListener(initializeExtensionState);

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
