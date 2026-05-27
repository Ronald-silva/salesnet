const locks = new Map<string, Promise<void>>();

export async function withPhoneLock<T>(
  phone: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(phone) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(phone, prev.then(() => next));
  await prev;
  const timeout = setTimeout(() => {
    resolve();
    locks.delete(phone);
    console.error('[phone-mutex] lock timeout for', phone);
  }, 30_000);
  try {
    return await fn();
  } finally {
    clearTimeout(timeout);
    resolve();
    if (locks.get(phone) === next) locks.delete(phone);
  }
}
