import type { FaithAtomicScope, FaithBusinessCoreScope } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import type { JunkConfig, JunkState } from "./types";
const LEVELS = Object.freeze(
  [...["D", "C", "B", "A", "S"]].map((level, index) => ({
    level,
    weight: [32, 32, 20, 12, 4][index],
  })),
);
export class JunkService {
  private readonly pools = new Map<string, readonly string[]>();
  constructor(
    private core: FaithBusinessCoreScope,
    private config: Readonly<JunkConfig>,
    private random: () => number = Math.random,
  ) {
    const pools = new Map<string, string[]>();
    for (const item of core.items
      .all()
      .filter(
        (value) =>
          ["D", "C", "B", "A", "S"].includes(value.level) && value.actions?.includes("open"),
      )) {
      const values = pools.get(item.level) ?? [];
      values.push(item.item_id);
      pools.set(item.level, values);
    }
    for (const [level, items] of pools) this.pools.set(level, Object.freeze(items));
  }
  pick(uid: number) {
    const date = this.core.gameDay.currentDate();
    return this.core.transaction.run(
      uid,
      async (tx) => {
        const row = await tx.data.get();
        const result = await this.pickInTransaction(tx, row.private, date);
        await tx.data.set({ private: row.private });
        return result;
      },
      { source: "junk.pick" },
    );
  }
  async pickInTransaction(tx: FaithAtomicScope, data: Record<string, unknown>, date: string) {
    const state = normalizeState(data, date);
    let cost = "今日免费次数";
    if (!state.freeUsed) state.freeUsed = true;
    else if (!state.paidUsed) {
      const payment = {
        gold: this.config.paidGoldCost,
        ascension_score: this.config.paidAscensionCost,
      };
      if (!(await tx.economy.canAfford(payment)))
        throw new BusinessError(
          "INSUFFICIENT_RESOURCE",
          `再次捡垃圾需要 ${payment.gold} 金币和 ${payment.ascension_score} 登神分。`,
        );
      await tx.economy.pay(payment);
      state.paidUsed = true;
      cost = `${payment.gold} 金币、${payment.ascension_score} 登神分`;
    } else throw new BusinessError("LIMIT_REACHED", "今天已经捡过两次垃圾了。");
    const picked: string[] = [],
      quantities = new Map<string, number>();
    for (let index = 0; index < this.config.itemCount; index++) {
      const level = weightedLevel(this.random),
        pool = this.pools.get(level);
      if (!pool?.length)
        throw new BusinessError("INTERNAL_ERROR", `等级 ${level} 没有可捡取物品。`);
      const itemId = pool[Math.floor(safeRandom(this.random) * pool.length)];
      quantities.set(itemId, (quantities.get(itemId) ?? 0) + 1);
      picked.push(this.core.items.require(itemId).name);
    }
    for (const [itemId, quantity] of quantities) await tx.items.give(itemId, quantity);
    Object.assign(data, state);
    return Object.freeze({ cost, items: Object.freeze(picked) });
  }
}
function normalizeState(value: Record<string, unknown>, date: string): JunkState {
  if (value.date !== date)
    return {
      date,
      freeUsed: false,
      paidUsed: false,
    };
  return {
    date,
    freeUsed: value.freeUsed === true,
    paidUsed: value.paidUsed === true,
  };
}
function safeRandom(random: () => number) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new BusinessError("INTERNAL_ERROR", "随机数生成器返回值无效。");
  return value;
}
function weightedLevel(random: () => number) {
  let value = safeRandom(random) * 100;
  for (const entry of LEVELS) {
    value -= entry.weight;
    if (value < 0) return entry.level;
  }
  return "S";
}
