import { createEmptyExtensionState, normalizeExtensionState } from "./state";
import type { ExtensionState } from "./types";

const EXTENSION_STATE_KEY = "lockInState";

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
  return normalizeExtensionState(await readStoredState());
}

export async function writeExtensionState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({
    [EXTENSION_STATE_KEY]: state,
  });
}

export async function ensureExtensionState(): Promise<ExtensionState> {
  const storedState = await readStoredState();
  const normalizedState = normalizeExtensionState(storedState);

  if (storedState === undefined) {
    const emptyState = createEmptyExtensionState();
    await writeExtensionState(emptyState);
    return emptyState;
  }

  if (JSON.stringify(storedState) !== JSON.stringify(normalizedState)) {
    await writeExtensionState(normalizedState);
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

async function readStoredState(): Promise<unknown> {
  const storedItems = await chrome.storage.local.get(EXTENSION_STATE_KEY);
  return storedItems[EXTENSION_STATE_KEY];
}
