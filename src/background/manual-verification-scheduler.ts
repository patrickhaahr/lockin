export type ManualVerificationScheduler<T> = {
  request: () => Promise<T>;
};

export type ManualVerificationSchedulerOptions = {
  cooldownMs: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

export function createManualVerificationScheduler<T>(
  runVerification: () => Promise<T>,
  options: ManualVerificationSchedulerOptions,
): ManualVerificationScheduler<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;
  let cooldownUntil = 0;
  let inFlightRequest: Promise<T> | null = null;
  let scheduledRequest: Promise<T> | null = null;

  return {
    request(): Promise<T> {
      if (inFlightRequest !== null) {
        return inFlightRequest;
      }

      if (scheduledRequest !== null) {
        return scheduledRequest;
      }

      const remainingCooldownMs = cooldownUntil - now();

      if (remainingCooldownMs > 0) {
        scheduledRequest = sleep(remainingCooldownMs).then(() => {
          scheduledRequest = null;
          return startVerification();
        });

        return scheduledRequest;
      }

      return startVerification();
    },
  };

  function startVerification(): Promise<T> {
    const verificationRequest = runVerification().finally(() => {
      inFlightRequest = null;
      cooldownUntil = now() + options.cooldownMs;
    });

    inFlightRequest = verificationRequest;
    return verificationRequest;
  }
}

async function sleepFor(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
