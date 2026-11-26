import { AsyncLocalStorage } from "node:async_hooks";

/** Runtime task admission and draining, shared by commands, interfaces and owned callbacks. */
export class BusinessTasks {
  private readonly context = new AsyncLocalStorage<{ active: boolean }>();
  private active = 0;
  private waiters = new Set<() => void>();

  constructor(private readonly assertReady: () => void) {}

  run<T>(task: () => T): T {
    if (!this.context.getStore()?.active) this.assertReady();
    const token = { active: true };
    this.active++;
    const finish = () => {
      token.active = false;
      this.active--;
      if (!this.active) {
        for (const resolve of this.waiters) resolve();
        this.waiters.clear();
      }
    };
    let pending = false;
    try {
      const result = this.context.run(token, task);
      if (result && typeof (result as unknown as PromiseLike<unknown>).then === "function") {
        const tracked = Promise.resolve(result).finally(finish);
        pending = true;
        return tracked as T;
      }
      return result;
    } finally {
      if (!pending) finish();
    }
  }

  drain(): Promise<void> {
    return this.active ? new Promise((resolve) => this.waiters.add(resolve)) : Promise.resolve();
  }
}
