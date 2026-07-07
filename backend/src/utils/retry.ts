export interface RetryOptions {
  /** Delay in ms before each retry attempt (length = number of retries, not counting the first try). */
  delaysMs: number[];
}

/** Retries fn() on failure, waiting delaysMs[i] before the (i+1)th retry. Rethrows the last error. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastErr: unknown;
  const attempts = options.delaysMs.length + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = options.delaysMs[attempt];
      if (delay !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastErr;
}
