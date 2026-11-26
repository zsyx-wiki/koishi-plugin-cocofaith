import { Context } from "koishi";
import { AsyncLocalStorage } from "node:async_hooks";
import { FaithCoreError } from "../errors";
import type { FaithHooksService } from "../hooks";
export type CoreDatabase = Context["database"];
/** @deprecated Core 内部实现；玩法通过 SDK 业务作用域访问事务。 */
export class FaithTransactionService {
  private sequence = 0;
  private hookDispatch = new AsyncLocalStorage<boolean>();
  private transactionContext = new AsyncLocalStorage<CoreDatabase>();
  private sqliteTail: Promise<unknown> = Promise.resolve();
  constructor(
    private ctx: Context,
    private hooks?: FaithHooksService,
  ) {}
  /** Nested transactions have no savepoint semantics. Reuse tx or combine UIDs with runMany. */
  assertNotNested() {
    if (this.transactionContext.getStore())
      throw new FaithCoreError(
        "CONFLICT",
        "不支持嵌套事务；请复用当前 tx，或使用 runMany 组合多用户操作。",
      );
  }
  async run<T>(task: (database: CoreDatabase) => Promise<T>): Promise<T> {
    this.assertNotNested();
    if (this.usesSqlite()) {
      const queued = this.sqliteTail.catch(() => undefined).then(() => this.runRoot(task));
      this.sqliteTail = queued.catch(() => undefined);
      return queued;
    }
    return this.runRoot(task);
  }
  private async runRoot<T>(task: (database: CoreDatabase) => Promise<T>): Promise<T> {
    const id = `tx-${Date.now().toString(36)}-${(++this.sequence).toString(36)}`,
      startedAt = Date.now();
    await this.notify("transaction/before", Object.freeze({ id, startedAt }));
    try {
      const result = await (this.ctx.database.transact((database) =>
        this.transactionContext.run(database, () => task(database)),
      ) as Promise<T>);
      await this.notify(
        "transaction/committed",
        Object.freeze({
          id,
          startedAt,
          duration: Date.now() - startedAt,
        }),
      );
      return result;
    } catch (error) {
      await this.notify(
        "transaction/rolled-back",
        Object.freeze({
          id,
          startedAt,
          duration: Date.now() - startedAt,
          error,
        }),
      );
      throw error;
    }
  }
  private usesSqlite() {
    return this.ctx.database.drivers.some((driver) => {
      const name = (
        driver.constructor as {
          name?: string;
        }
      ).name?.toLowerCase();
      return name === "sqlite" || name === "sqlitedriver";
    });
  }
  private async notify(event: string, payload: unknown) {
    if (!this.hooks || this.hookDispatch.getStore()) return;
    await this.hookDispatch.run(true, () => this.hooks!.emit(event, payload));
  }
}
