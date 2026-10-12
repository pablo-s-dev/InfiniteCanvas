/** Bounds native SDK promises as well as HTTP operations. Native callbacks can
 * arrive later; callers must still check their account generation afterwards. */
export function withDeadline<T>(promise: Promise<T>, milliseconds = 45_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Cloud Sync operation timed out.")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
