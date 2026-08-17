/**
 * Resolves with the operation's value, or with `null` when it takes longer than
 * the given budget. The underlying promise is not cancelled, because the
 * platform APIs this guards do not support cancellation; the caller simply
 * stops waiting and moves on to its fallback.
 */
export async function resolveWithin<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), milliseconds);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
