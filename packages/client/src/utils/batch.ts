/**
 * Run an async operation over a list of items, keeping successes and failures
 * separate instead of letting one failure abort the whole batch.
 */
export async function processBatch<TItem, TResult>(
  items: TItem[],
  getId: (item: TItem) => string,
  operation: (item: TItem) => Promise<TResult>
): Promise<{
  results: { item: TItem; result: TResult }[];
  failed: { id: string; error: string }[];
}> {
  const settled = await Promise.allSettled(items.map(operation));

  const results: { item: TItem; result: TResult }[] = [];
  const failed: { id: string; error: string }[] = [];

  settled.forEach((res, idx) => {
    const item = items[idx];
    if (res.status === 'fulfilled') {
      results.push({ item, result: res.value });
    } else {
      const id = getId(item);
      console.error(`Failed to process item ${id}:`, res.reason);
      failed.push({
        id,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  });

  return { results, failed };
}
