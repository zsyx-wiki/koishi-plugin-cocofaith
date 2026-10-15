import type { FaithBusinessCoreScope } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import type { DailyPrayerConfig, DailyPrayerResult, DailyPrayerState } from "./types";
export class DailyPrayerService {
  constructor(
    private core: FaithBusinessCoreScope,
    private config: Readonly<DailyPrayerConfig>,
    private random: () => number = Math.random,
  ) {}
  configure(config: Readonly<DailyPrayerConfig>) {
    this.config = config;
  }
  async pray(uid: number, expectedFaith: string, god: string): Promise<DailyPrayerResult> {
    const date = this.core.gameDay.currentDate();
    const user = await this.core.users.require(uid);
    if (user.faiths[0] !== expectedFaith)
      throw new BusinessError("NOT_ALLOWED", "这段祷词没有回应你。请使用当前信仰对应的祷词。");
    const base = {
      ascension_score: randomInt(this.random, this.config.ascensionMin, this.config.ascensionMax),
      gold: randomInt(this.random, this.config.goldMin, this.config.goldMax),
    };
    const positive = {
      ascension_score: Math.max(0, base.ascension_score),
      gold: Math.max(0, base.gold),
    };
    const preview = Object.values(positive).some((value) => value > 0)
      ? await this.core.economy.previewReward(uid, positive, "reward")
      : { applied: { gold: 0, ascension_score: 0 } };
    const reward = {
      ascension_score:
        base.ascension_score < 0 ? base.ascension_score : (preview.applied.ascension_score ?? 0),
      gold: base.gold < 0 ? base.gold : (preview.applied.gold ?? 0),
    };
    const limitBonus = await this.core.bonuses.calculate({
      uid,
      type: "daily_prayer.daily_limit",
      baseValue: this.config.baseLimit,
      source: "daily_prayer.limit",
    });
    return this.core.transaction.run(
      uid,
      async (tx) => {
        const current = await tx.users.get();
        if (current.faiths[0] !== expectedFaith)
          throw new BusinessError("CONFLICT", "信仰状态已变化，请重新祈祷。");
        const row = await tx.data.get(),
          state = normalizeState(row.private, date);
        const limit =
          Math.max(0, limitBonus.finalValue) + state.permanentExtra + state.temporaryExtra;
        if (state.count >= limit)
          throw new BusinessError(
            "LIMIT_REACHED",
            `你今天已经祈祷了 ${state.count} 次，已达上限（${limit} 次）。`,
          );
        const delta = Object.fromEntries(Object.entries(reward).filter(([, value]) => value !== 0));
        if (Object.keys(delta).length) await tx.users.change(delta);
        state.count++;
        await tx.data.set({ private: { ...state } });
        return Object.freeze({
          faith: expectedFaith,
          god,
          count: state.count,
          limit,
          base: Object.freeze(base),
          reward: Object.freeze(reward),
        });
      },
      { source: "daily_prayer.pray" },
    );
  }
  async status(uid: number) {
    const date = this.core.gameDay.currentDate(),
      row = await this.core.data.get(uid),
      state = normalizeState(row.private, date);
    const bonus = await this.core.bonuses.calculate({
      uid,
      type: "daily_prayer.daily_limit",
      baseValue: this.config.baseLimit,
      source: "daily_prayer.status",
    });
    const limit = Math.max(0, bonus.finalValue) + state.permanentExtra + state.temporaryExtra;
    return Object.freeze({
      ...state,
      limit,
      remaining: Math.max(0, limit - state.count),
    });
  }
  adjust(
    uid: number,
    field: "permanentExtra" | "temporaryExtra",
    delta: number,
    idempotencyKey?: string,
  ) {
    if (!Number.isSafeInteger(delta) || delta === 0)
      throw new BusinessError("INVALID_INPUT", "祈祷次数变化必须是非零安全整数。");
    const date = this.core.gameDay.currentDate();
    return this.core.transaction.run(
      uid,
      async (tx) => {
        const row = await tx.data.get(),
          state = normalizeState(row.private, date),
          next = state[field] + delta;
        if (!Number.isSafeInteger(next) || next < 0 || next > 1000000)
          throw new BusinessError("INVALID_INPUT", "调整后的祈祷次数无效。");
        state[field] = next;
        if (field === "temporaryExtra") state.temporaryDate = date;
        await tx.data.set({ private: { ...state } });
        return next;
      },
      { source: `daily_prayer.adjust_${field}`, idempotencyKey },
    );
  }
}
function normalizeState(value: Record<string, unknown>, date: string): DailyPrayerState {
  const number = (key: keyof DailyPrayerState) =>
    Number.isSafeInteger(value[key]) &&
    (value[key] as number) >= 0 &&
    (value[key] as number) <= 1000000
      ? (value[key] as number)
      : 0;
  const sameDay = value.date === date,
    temporarySameDay = value.temporaryDate === date;
  return {
    date,
    count: sameDay ? number("count") : 0,
    permanentExtra: number("permanentExtra"),
    temporaryExtra: temporarySameDay ? number("temporaryExtra") : 0,
    temporaryDate: temporarySameDay ? date : "",
  };
}
function randomInt(random: () => number, min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}
