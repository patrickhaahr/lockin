import { createEmptyExtensionState, normalizeExtensionState } from "./state";
import type { ExtensionState, VerificationStatus } from "./types";

const EXTENSION_STATE_KEY = "lockInState";
const VERIFICATION_STATUS_KEY = "lockInVerificationStatus";

export type StateMutation<TState, TResult> = {
  nextState: TState | null;
  result: TResult;
};

export type StateMutationHandler<TState, TResult> = (
  currentState: TState,
) => StateMutation<TState, TResult>;

export type StateMutationQueue<TState> = {
  getState: () => TState;
  run: <TResult>(mutateState: StateMutationHandler<TState, TResult>) => Promise<TResult>;
};

export async function readExtensionState(): Promise<ExtensionState> {
  return normalizeStoredExtensionState(await readStoredState());
}

export async function writeExtensionState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({
    [EXTENSION_STATE_KEY]: state,
  });
}

export async function writeVerificationStatus(verification: VerificationStatus): Promise<void> {
  await chrome.storage.local.set({
    [VERIFICATION_STATUS_KEY]: verification,
  });
}

export async function ensureExtensionState(): Promise<ExtensionState> {
  const storedState = await readStoredState();
  const normalizedState = normalizeStoredExtensionState(storedState);

  if (storedState.extensionState === undefined) {
    const emptyState = createEmptyExtensionState();
    await writeExtensionState(emptyState);
    await writeVerificationStatus(emptyState.verification);
    return emptyState;
  }

  if (JSON.stringify(storedState.extensionState) !== JSON.stringify(normalizedState)) {
    await writeExtensionState(normalizedState);
  }

  if (
    JSON.stringify(storedState.verificationStatus) !== JSON.stringify(normalizedState.verification)
  ) {
    await writeVerificationStatus(normalizedState.verification);
  }

  return normalizedState;
}

export function createStateMutationQueue<TState>(
  initialState: TState,
  writeState: (state: TState) => Promise<void>,
): StateMutationQueue<TState> {
  let currentState = initialState;
  let queuedWrite: Promise<void> = Promise.resolve();

  return {
    getState(): TState {
      return currentState;
    },

    async run<TResult>(mutateState: StateMutationHandler<TState, TResult>): Promise<TResult> {
      const queuedMutation = queuedWrite.then(async () => {
        const mutation = mutateState(currentState);

        if (mutation.nextState !== null) {
          await writeState(mutation.nextState);
          currentState = mutation.nextState;
        }

        return mutation.result;
      });

      queuedWrite = queuedMutation.then(noop, noop);

      return queuedMutation;
    },
  };
}

function noop(): void {}

async function readStoredState(): Promise<{
  extensionState: unknown;
  verificationStatus: VerificationStatus | null;
}> {
  const storedItems = await chrome.storage.local.get([
    EXTENSION_STATE_KEY,
    VERIFICATION_STATUS_KEY,
  ]);

  return {
    extensionState: storedItems[EXTENSION_STATE_KEY],
    verificationStatus: isVerificationStatus(storedItems[VERIFICATION_STATUS_KEY])
      ? storedItems[VERIFICATION_STATUS_KEY]
      : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVerificationStatus(value: unknown): value is VerificationStatus {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    (typeof value.checkedAt === "string" || value.checkedAt === null) &&
    (typeof value.lastAcceptedSolveAt === "string" || value.lastAcceptedSolveAt === null) &&
    (typeof value.allowCacheBrowserLocalDay === "string" ||
      value.allowCacheBrowserLocalDay === null)
  );
}

function normalizeStoredExtensionState(storedState: {
  extensionState: unknown;
  verificationStatus: VerificationStatus | null;
}): ExtensionState {
  return normalizeExtensionState({
    ...(isRecord(storedState.extensionState) ? storedState.extensionState : {}),
    verification:
      storedState.verificationStatus ??
      (isRecord(storedState.extensionState) ? storedState.extensionState.verification : undefined),
  });
}
