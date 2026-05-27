import { BoundedQueue } from '../../src/utils/bounded-queue';

describe('BoundedQueue', () => {
  describe('basic push/pop', () => {
    it('should push and pop items in FIFO order', async () => {
      const q = new BoundedQueue<number>(10);

      await q.push(1);
      await q.push(2);
      await q.push(3);

      expect(await q.pop()).toBe(1);
      expect(await q.pop()).toBe(2);
      expect(await q.pop()).toBe(3);
    });

    it('should return null from pop after signalPushComplete with empty queue', async () => {
      const q = new BoundedQueue<string>(5);

      q.signalPushComplete();

      expect(await q.pop()).toBeNull();
    });

    it('should drain remaining items before returning null after signalPushComplete', async () => {
      const q = new BoundedQueue<number>(5);

      await q.push(10);
      await q.push(20);
      q.signalPushComplete();

      expect(await q.pop()).toBe(10);
      expect(await q.pop()).toBe(20);
      expect(await q.pop()).toBeNull();
    });

    it('should throw if pushing after signalPushComplete', async () => {
      const q = new BoundedQueue<number>(5);
      q.signalPushComplete();

      await expect(q.push(1)).rejects.toThrow('Cannot push after done');
    });
  });

  describe('capacity / backpressure', () => {
    it('should buffer up to capacity without blocking', async () => {
      const q = new BoundedQueue<number>(3);

      // These should not block since capacity = 3
      const p1 = q.push(1);
      const p2 = q.push(2);
      const p3 = q.push(3);

      // Pop one to unblock any waiting push
      await q.pop();

      await Promise.all([p1, p2, p3]);
    });

    it('should block push when at capacity and unblock when popped', async () => {
      const q = new BoundedQueue<number>(2);

      await q.push(1);
      await q.push(2);

      // This push should be blocked (capacity full)
      let pushed = false;
      const pushPromise = q.push(3).then(() => {
        pushed = true;
      });

      // Not pushed yet
      expect(pushed).toBe(false);

      // Pop unblocks the waiting push
      await q.pop();
      await pushPromise;

      expect(pushed).toBe(true);
    });
  });

  describe('concurrent producer/consumer', () => {
    it('should deliver all items with a slow consumer', async () => {
      const q = new BoundedQueue<number>(2);
      const results: number[] = [];
      const N = 10;

      const producer = async () => {
        for (let i = 0; i < N; i++) {
          await q.push(i);
        }
        q.signalPushComplete();
      };

      const consumer = async () => {
        while (true) {
          const item = await q.pop();
          if (item === null) break;
          results.push(item);
        }
      };

      await Promise.all([producer(), consumer()]);

      expect(results).toHaveLength(N);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('pop before push (waiting consumer)', () => {
    it('should resolve pop when item is pushed later', async () => {
      const q = new BoundedQueue<string>(5);

      const popPromise = q.pop();

      // Push after pop is already waiting
      await q.push('hello');

      expect(await popPromise).toBe('hello');
    });
  });
});
