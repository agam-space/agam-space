import { pLimiter } from '../../src/utils/p-limiter';

describe('pLimiter', () => {
  it('should throw for invalid concurrency', () => {
    expect(() => pLimiter(0)).toThrow('Expected `concurrency` to be an integer ≥ 1');
    expect(() => pLimiter(-1)).toThrow();
    expect(() => pLimiter(1.5)).toThrow();
  });

  it('should run a single task', async () => {
    const limit = pLimiter(1);
    const result = await limit(async () => 42);
    expect(result).toBe(42);
  });

  it('should respect concurrency limit', async () => {
    const limit = pLimiter(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
    };

    await Promise.all([limit(task), limit(task), limit(task), limit(task)]);

    expect(maxConcurrent).toBe(2);
  });

  it('should queue tasks beyond concurrency', async () => {
    const limit = pLimiter(1);
    const order: number[] = [];

    const task = (id: number) => async () => {
      order.push(id);
      await new Promise(r => setTimeout(r, 5));
    };

    await Promise.all([limit(task(1)), limit(task(2)), limit(task(3))]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('should propagate task errors', async () => {
    const limit = pLimiter(2);

    await expect(
      limit(async () => {
        throw new Error('task failed');
      })
    ).rejects.toThrow('task failed');
  });

  it('should continue processing after a task error', async () => {
    const limit = pLimiter(1);

    const fail = limit(async () => {
      throw new Error('oops');
    });
    const succeed = limit(async () => 'ok');

    await expect(fail).rejects.toThrow('oops');
    expect(await succeed).toBe('ok');
  });

  it('should track activeCount and pendingCount', async () => {
    const limit = pLimiter(1);

    expect(limit.activeCount()).toBe(0);
    expect(limit.pendingCount()).toBe(0);

    let resolveTask!: () => void;
    const blockingTask = new Promise<void>(r => {
      resolveTask = r;
    });

    // Start one task that blocks
    const p1 = limit(async () => blockingTask);
    // Queue a second while first is running
    const p2 = limit(async () => 'done');

    await new Promise(r => process.nextTick(r));

    expect(limit.activeCount()).toBe(1);
    expect(limit.pendingCount()).toBe(1);

    resolveTask();
    await Promise.all([p1, p2]);

    expect(limit.activeCount()).toBe(0);
    expect(limit.pendingCount()).toBe(0);
  });

  it('should pass arguments to task function', async () => {
    const limit = pLimiter(1);

    const result = await limit(async (a, b) => (a as number) + (b as number), 3, 4);

    expect(result).toBe(7);
  });
});
