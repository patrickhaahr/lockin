import { getBrowserLocalDay, isSetupRequired, isWithinHardLockWindow } from "./state";
import type { ExtensionState, VerificationStateKind, VerificationStatus } from "./types";

const LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql/";
const ACCEPTED_SUBMISSIONS_LIMIT = 1;
export const VERIFY_DAILY_SOLVE_GATE_MESSAGE_TYPE = "lockIn.verifyDailySolveGate";
const VERIFY_DAILY_SOLVE_GATE_QUERY = `query verifyDailySolveGate($username: String!, $limit: Int!) {
  matchedUser(username: $username) {
    username
  }
  recentAcSubmissionList(username: $username, limit: $limit) {
    timestamp
  }
}`;

type FetchLike = typeof fetch;

type LeetCodeGraphqlResponse = {
  data?: {
    matchedUser?: {
      username?: string;
    } | null;
    recentAcSubmissionList?: Array<{
      timestamp?: string;
    }>;
  };
};

type AcceptedSolveFetchResult =
  | {
      kind: "invalidProfile";
    }
  | {
      kind: "verified";
      lastAcceptedSolveAt: string | null;
    };

export type DailySolveGateVerificationResult = {
  nextState: ExtensionState;
  usedCache: boolean;
};

export type DailySolveGateVerificationOptions = {
  now?: Date;
  fetchImpl?: FetchLike;
};

export type VerifyDailySolveGateRequest = {
  type: typeof VERIFY_DAILY_SOLVE_GATE_MESSAGE_TYPE;
};

export type VerifyDailySolveGateResponse = {
  verification: VerificationStatus;
  usedCache: boolean;
};

export async function requestDailySolveGateVerification(): Promise<VerifyDailySolveGateResponse> {
  return chrome.runtime.sendMessage({
    type: VERIFY_DAILY_SOLVE_GATE_MESSAGE_TYPE,
  } satisfies VerifyDailySolveGateRequest) as Promise<VerifyDailySolveGateResponse>;
}

export async function runDailySolveGateVerification(
  state: ExtensionState,
  options: DailySolveGateVerificationOptions = {},
): Promise<DailySolveGateVerificationResult> {
  const now = options.now ?? new Date();

  if (isSetupRequired(state)) {
    return {
      nextState: {
        ...state,
        verification: createVerificationStatus("setupRequired", now, null, null),
      },
      usedCache: false,
    };
  }

  if (hasAllowCacheForBrowserLocalDay(state.verification, now)) {
    return {
      nextState: {
        ...state,
        verification: createVerificationStatus(
          getVerificationKind(state, true, now),
          now,
          state.verification.lastAcceptedSolveAt,
          getBrowserLocalDay(now),
        ),
      },
      usedCache: true,
    };
  }

  try {
    const acceptedSolveResult = await fetchAcceptedSolveResult(
      state.currentConfig?.trackedProfile ?? "",
      options.fetchImpl ?? fetch,
    );

    return {
      nextState: {
        ...state,
        verification: createVerificationStatusFromAcceptedSolveResult(
          state,
          acceptedSolveResult,
          now,
        ),
      },
      usedCache: false,
    };
  } catch {
    return {
      nextState: {
        ...state,
        verification: createVerificationStatus(
          "verificationFailed",
          now,
          state.verification.lastAcceptedSolveAt,
          null,
        ),
      },
      usedCache: false,
    };
  }
}

export function hasAllowCacheForBrowserLocalDay(
  verification: VerificationStatus,
  now: Date = new Date(),
): boolean {
  const browserLocalDay = getBrowserLocalDay(now);

  return (
    (verification.kind === "allowedToday" || verification.kind === "blockedByHardLock") &&
    verification.allowCacheBrowserLocalDay === browserLocalDay &&
    verification.lastAcceptedSolveAt !== null
  );
}

async function fetchAcceptedSolveResult(
  trackedProfile: string,
  fetchImpl: FetchLike,
): Promise<AcceptedSolveFetchResult> {
  const response = await fetchImpl(LEETCODE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: VERIFY_DAILY_SOLVE_GATE_QUERY,
      variables: {
        username: trackedProfile,
        limit: ACCEPTED_SUBMISSIONS_LIMIT,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("LeetCode verification request failed.");
  }

  const parsedResponse = (await response.json()) as LeetCodeGraphqlResponse;
  const responseData = parsedResponse.data;

  if (responseData === undefined) {
    throw new Error("LeetCode verification response was missing data.");
  }

  if (responseData.matchedUser === null) {
    return {
      kind: "invalidProfile",
    };
  }

  if (
    responseData.matchedUser === undefined ||
    !Array.isArray(responseData.recentAcSubmissionList)
  ) {
    throw new Error("LeetCode verification response shape was invalid.");
  }

  const lastAcceptedSolveAt = parseMostRecentAcceptedSolveAt(responseData.recentAcSubmissionList);

  return {
    kind: "verified",
    lastAcceptedSolveAt,
  };
}

function createVerificationStatusFromAcceptedSolveResult(
  state: ExtensionState,
  acceptedSolveResult: AcceptedSolveFetchResult,
  now: Date,
): VerificationStatus {
  if (acceptedSolveResult.kind === "invalidProfile") {
    return createVerificationStatus("setupRequired", now, null, null);
  }

  if (isAcceptedSolveForBrowserLocalDay(acceptedSolveResult.lastAcceptedSolveAt, now)) {
    return createVerificationStatus(
      getVerificationKind(state, true, now),
      now,
      acceptedSolveResult.lastAcceptedSolveAt,
      getBrowserLocalDay(now),
    );
  }

  return createVerificationStatus(
    getVerificationKind(state, false, now),
    now,
    acceptedSolveResult.lastAcceptedSolveAt,
    null,
  );
}

function createVerificationStatus(
  kind: VerificationStateKind,
  now: Date,
  lastAcceptedSolveAt: string | null,
  allowCacheBrowserLocalDay: string | null,
): VerificationStatus {
  return {
    kind,
    checkedAt: now.toISOString(),
    lastAcceptedSolveAt,
    allowCacheBrowserLocalDay,
  };
}

function getVerificationKind(
  state: ExtensionState,
  dailySolveGateSatisfied: boolean,
  now: Date,
): VerificationStateKind {
  if (
    state.currentConfig !== null &&
    isWithinHardLockWindow(state.currentConfig.hardLockWindow, now)
  ) {
    return "blockedByHardLock";
  }

  return dailySolveGateSatisfied ? "allowedToday" : "blockedByDailySolveGate";
}

function parseMostRecentAcceptedSolveAt(
  recentAcSubmissionList: Array<{
    timestamp?: string;
  }>,
): string | null {
  for (const submission of recentAcSubmissionList) {
    const timestamp = submission.timestamp;

    if (typeof timestamp !== "string") {
      continue;
    }

    const timestampSeconds = Number(timestamp);

    if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
      continue;
    }

    return new Date(timestampSeconds * 1000).toISOString();
  }

  return null;
}

function isAcceptedSolveForBrowserLocalDay(lastAcceptedSolveAt: string | null, now: Date): boolean {
  return (
    lastAcceptedSolveAt !== null &&
    getBrowserLocalDay(new Date(lastAcceptedSolveAt)) === getBrowserLocalDay(now)
  );
}
