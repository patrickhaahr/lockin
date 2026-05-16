import {
  createStateMutationQueue,
  ensureExtensionState,
  type StateMutationQueue,
  writeExtensionState,
} from "@/shared/storage";
import {
  runDailySolveGateVerification,
  VERIFY_DAILY_SOLVE_GATE_MESSAGE_TYPE,
  type VerifyDailySolveGateRequest,
  type VerifyDailySolveGateResponse,
} from "@/shared/verification";
import type { ExtensionState } from "@/shared/types";

let extensionStateQueuePromise: Promise<StateMutationQueue<ExtensionState>> | null = null;

function initializeExtensionState(): void {
  void getExtensionStateQueue();
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
  const extensionStateQueue = await getExtensionStateQueue();
  const currentState = extensionStateQueue.getState();
  const verificationResult = await runDailySolveGateVerification(currentState);
  const response = await extensionStateQueue.run((latestState) => ({
    nextState: {
      ...latestState,
      verification: verificationResult.nextState.verification,
    },
    result: {
      verification: verificationResult.nextState.verification,
      usedCache: verificationResult.usedCache,
    },
  }));

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

async function getExtensionStateQueue(): Promise<StateMutationQueue<ExtensionState>> {
  if (extensionStateQueuePromise === null) {
    extensionStateQueuePromise = ensureExtensionState().then((initialState) =>
      createStateMutationQueue(initialState, writeExtensionState),
    );
  }

  return extensionStateQueuePromise;
}
