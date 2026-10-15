import type { FaithBusinessCoreScope } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import { VoidPrayerPool } from "./pool";
import {
  type VoidPrayerConfig,
  type VoidPrayerDraw,
  type VoidPrayerResult,
  type VoidPrayerState,
} from "./types";
const HIGH_LEVELS = new Set(["SS", "SSS", "SP"]);
export type VoidPrayerAdjustment = "permanentExtra" | "temporaryExtra" | "consumableExtra";
export class VoidPrayerService {
  private pool: VoidPrayerPool;
  constructor(
    private core: FaithBusinessCoreScope,
    private config: Readonly<VoidPrayerConfig>,
    private random: () => number = Math.random,
  ) {
    this.pool = new VoidPrayerPool(core, config);
  }
  configure(config: Readonly<VoidPrayerConfig>) {
    const pool = new VoidPrayerPool(this.core, config);
    this.config = config;
    this.pool = pool;
  }
  async pray(uid: number, requested = 1): Promise<VoidPrayerResult> {
    if (
      !Number.isSafeInteger(requested) ||
      requested <= 0 ||
      requested > this.config.maxDrawsPerCommand
    ) {
      throw new BusinessError(
        "INVALID_INPUT",
        `单次祈求次数必须为 1-${this.config.maxDrawsPerCommand}。`,
      );
    }
    const date = this.core.gameDay.currentDate();
    const [limitBonus, costBonus] = await Promise.all([
      this.core.bonuses.calculate({
        uid,
        type: "void_prayer.daily_limit",
        baseValue: this.config.dailyLimit,
        source: "void_prayer.limit",
      }),
      this.core.bonuses.calculate({
        uid,
        type: "void_prayer.cost",
        baseValue: 100,
        source: "void_prayer.cost",
      }),
    ]);
    return this.core.transaction.run(
      uid,
      async (tx) => {
        const row = await tx.data.get(),
          state = normalizeState(row.private, date);
        const dailyLimit =
          Math.max(0, limitBonus.finalValue) + state.permanentExtra + state.temporaryExtra;
        const remaining = Math.max(0, dailyLimit - state.dailyUsed) + state.consumableExtra;
        if (!remaining)
          throw new BusinessError("LIMIT_REACHED", "你今天的虚空祈求次数已经用完了。");
        const actual = Math.min(requested, remaining),
          dailyAvailable = Math.max(0, dailyLimit - state.dailyUsed);
        const dailyDraws = Math.min(actual, dailyAvailable),
          consumableUsed = actual - dailyDraws;
        const baseCost = calculateCost(state.dailyUsed, actual, this.config, state.costReduction);
        const cost = Math.max(
          0,
          Math.round(baseCost * costBonus.multiplier + costBonus.fixedBonus),
        );
        if (cost && !(await tx.economy.canAfford({ gold: cost }))) {
          const wallet = await tx.economy.getWallet();
          throw new BusinessError(
            "INSUFFICIENT_RESOURCE",
            `本次祈求需要 ${cost} 金币，你当前拥有 ${wallet.gold} 金币。`,
            { cost, balance: wallet.gold },
          );
        }
        const draws: VoidPrayerDraw[] = [],
          quantities = new Map<string, number>();
        for (let index = 0; index < actual; index++) {
          const item = this.pool.draw(this.random);
          draws.push(Object.freeze({ item, easterEgg: false }));
          quantities.set(item.item_id, (quantities.get(item.item_id) ?? 0) + 1);
          if (HIGH_LEVELS.has(item.level) && this.random() < this.config.easterEggChance) {
            const egg = this.pool.drawEasterEgg(this.random);
            if (
              egg &&
              !quantities.has(egg.item_id) &&
              (await tx.items.getQuantity(egg.item_id)) === 0
            ) {
              draws.push(Object.freeze({ item: egg, easterEgg: true }));
              quantities.set(egg.item_id, 1);
            }
          }
        }
        if (cost) await tx.economy.pay({ gold: cost });
        for (const [itemId, quantity] of quantities) await tx.items.give(itemId, quantity);
        const next: VoidPrayerState = {
          ...state,
          date,
          dailyUsed: state.dailyUsed + dailyDraws,
          consumableExtra: state.consumableExtra - consumableUsed,
        };
        await tx.data.set({ private: next });
        const counts = countLevels(draws);
        return Object.freeze({
          requested,
          actual,
          cost,
          date,
          used: next.dailyUsed,
          dailyLimit,
          remaining: remaining - actual,
          draws: Object.freeze(draws),
          counts,
        });
      },
      { source: "void_prayer.draw" },
    );
  }
  async status(uid: number) {
    const date = this.core.gameDay.currentDate(),
      row = await this.core.data.get(uid),
      state = normalizeState(row.private, date);
    const bonus = await this.core.bonuses.calculate({
      uid,
      type: "void_prayer.daily_limit",
      baseValue: this.config.dailyLimit,
      source: "void_prayer.status",
    });
    const dailyLimit = Math.max(0, bonus.finalValue) + state.permanentExtra + state.temporaryExtra;
    return Object.freeze({
      ...state,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - state.dailyUsed) + state.consumableExtra,
    });
  }
  adjust(uid: number, field: VoidPrayerAdjustment, delta: number, idempotencyKey?: string) {
    if (!Number.isSafeInteger(delta) || delta === 0)
      throw new BusinessError("INVALID_INPUT", "祈求次数变化必须是非零安全整数。");
    const date = this.core.gameDay.currentDate();
    return this.core.transaction.run(
      uid,
      async (tx) => {
        const row = await tx.data.get(),
          state = normalizeState(row.private, date),
          next = state[field] + delta;
        if (!Number.isSafeInteger(next) || next < 0 || next > 1000000)
          throw new BusinessError("INVALID_INPUT", "调整后的祈求次数无效。");
        state[field] = next;
        if (field === "temporaryExtra") state.temporaryDate = date;
        await tx.data.set({ private: state });
        return next;
      },
      { source: `void_prayer.adjust_${field}`, idempotencyKey },
    );
  }
}
export function calculateCost(
  used: number,
  count: number,
  config: Readonly<VoidPrayerConfig>,
  reduction: number,
) {
  const baseDraws = Math.min(count, Math.max(0, config.baseCostDraws - used));
  return (
    baseDraws * Math.round(config.baseCost * (1 - reduction)) +
    (count - baseDraws) * Math.round(config.extraCost * (1 - reduction))
  );
}
function normalizeState(value: Record<string, unknown>, date: string): VoidPrayerState {
  const number = (key: keyof VoidPrayerState, max = 1000000) =>
    Number.isSafeInteger(value[key]) && (value[key] as number) >= 0 && (value[key] as number) <= max
      ? (value[key] as number)
      : 0;
  const sameDay = value.date === date,
    temporarySameDay = value.temporaryDate === date;
  return {
    date,
    dailyUsed: sameDay ? number("dailyUsed") : 0,
    permanentExtra: number("permanentExtra"),
    temporaryExtra: temporarySameDay ? number("temporaryExtra") : 0,
    temporaryDate: temporarySameDay ? date : "",
    consumableExtra: number("consumableExtra"),
    costReduction:
      typeof value.costReduction === "number" && Number.isFinite(value.costReduction)
        ? Math.max(0, Math.min(1, value.costReduction))
        : 0,
  };
}
function countLevels(draws: readonly VoidPrayerDraw[]) {
  const counts: Record<string, number> = {};
  for (const draw of draws) counts[draw.item.level] = (counts[draw.item.level] ?? 0) + 1;
  return Object.freeze(counts);
}
