import { getBrowserLocalDay, isWithinHardLockWindow } from "./state";
import { readExtensionState, writeVerificationStatus } from "./storage";
import type { ExtensionState, VerificationStateKind, VerificationStatus } from "./types";
import { getBlockedSiteAccessDecision } from "./blocked-site-policy";

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

export type DailySolveGateVerificationRequestOptions = DailySolveGateVerificationOptions & {
  readState?: () => Promise<ExtensionState>;
  sendMessage?: (message: VerifyDailySolveGateRequest) => Promise<VerifyDailySolveGateResponse>;
  writeVerification?: (verification: VerificationStatus) => Promise<void>;
};

export type { BlockedSiteBlockReason } from "./blocked-site-policy";

export async function requestDailySolveGateVerification(
  options: DailySolveGateVerificationRequestOptions = {},
): Promise<VerifyDailySolveGateResponse> {
  const request = {
    type: VERIFY_DAILY_SOLVE_GATE_MESSAGE_TYPE,
  } satisfies VerifyDailySolveGateRequest;
  const readState = options.readState ?? readExtensionState;
  const writeVerification = options.writeVerification ?? writeVerificationStatus;

  try {
    const response =
      options.sendMessage !== undefined
        ? await options.sendMessage(request)
        : ((await chrome.runtime.sendMessage(request)) as VerifyDailySolveGateResponse);

    if (response.verification.kind !== "verificationFailed") {
      return response;
    }
  } catch {
    // If the background path is unavailable, retry directly from the extension page.
  }

  const verificationResult = await runDailySolveGateVerification(await readState(), options);
  const verification = verificationResult.nextState.verification;

  await writeVerification(verification);

  return {
    verification,
    usedCache: verificationResult.usedCache,
  };
}

export async function runDailySolveGateVerification(
  state: ExtensionState,
  options: DailySolveGateVerificationOptions = {},
): Promise<DailySolveGateVerificationResult> {
  const now = options.now ?? new Date();
  const precheckedDecision = getBlockedSiteAccessDecision(state, now);

  if (precheckedDecision.kind === "block" && precheckedDecision.reason === "setupRequired") {
    return {
      nextState: {
        ...state,
        verification: createVerificationStatus("setupRequired", now, null, null),
      },
      usedCache: false,
    };
  }

  if (precheckedDecision.kind === "allow") {
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

async function fetchAcceptedSolveResult(
  trackedProfile: string,
  fetchImpl: FetchLike,
): Promise<AcceptedSolveFetchResult> {
  const requestUrl = new URL(LEETCODE_GRAPHQL_URL);

  // LeetCode rejects extension POST requests here with CSRF protection, so this
  // verification query has to stay on GET even though it places the Tracked Profile in the URL.
  requestUrl.search = new URLSearchParams({
    query: VERIFY_DAILY_SOLVE_GATE_QUERY,
    variables: JSON.stringify({
      username: trackedProfile,
      limit: ACCEPTED_SUBMISSIONS_LIMIT,
    }),
  }).toString();

  const response = await fetchImpl(requestUrl.toString(), {
    method: "GET",
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
