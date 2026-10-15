import type { FaithBusinessCoreScope, FaithItemDefinition } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import { VOID_PRAYER_LEVELS, type VoidPrayerConfig, type VoidPrayerLevel } from "./types";
export class VoidPrayerPool {
  private byLevel = new Map<VoidPrayerLevel, readonly Readonly<FaithItemDefinition>[]>();
  private readonly spItems: readonly Readonly<FaithItemDefinition>[];
  readonly easterEggs: readonly Readonly<FaithItemDefinition>[];
  constructor(
    core: FaithBusinessCoreScope,
    private config: Readonly<VoidPrayerConfig>,
  ) {
    const obtainable = core.items.obtainable();
    this.easterEggs = Object.freeze(
      obtainable.filter((item) => item.level === "彩蛋" || item.type === "彩蛋"),
    );
    for (const level of VOID_PRAYER_LEVELS) {
      const items = obtainable.filter((item) => item.level === level && item.type !== "彩蛋");
      if (config.probabilities[level] > 0 && !items.length)
        throw new BusinessError("CONFIG_INVALID", `等级 ${level} 没有可用于虚空祈求的物品。`);
      this.byLevel.set(level, Object.freeze(items));
    }
    const normal = this.byLevel.get("SP") ?? [];
    const up = normal.filter((item) => config.upSpItems.includes(item.name));
    this.spItems = up.length ? Object.freeze(up) : normal;
  }
  draw(random = Math.random) {
    const roll = boundedRandom(random),
      level = selectLevel(roll, this.config.probabilities);
    const normal = this.byLevel.get(level)!;
    if (level !== "SP") return pick(normal, random);
    return pick(this.spItems, random);
  }
  drawEasterEgg(random = Math.random) {
    return this.easterEggs.length ? pick(this.easterEggs, random) : null;
  }
}
export function selectLevel(
  roll: number,
  probabilities: Readonly<Record<VoidPrayerLevel, number>>,
): VoidPrayerLevel {
  let cumulative = 0;
  for (const level of VOID_PRAYER_LEVELS) {
    cumulative += probabilities[level];
    if (roll < cumulative) return level;
  }
  return "D";
}
function pick<T>(items: readonly T[], random: () => number) {
  if (!items.length) throw new BusinessError("INTERNAL_ERROR", "虚空祈求物品池为空。");
  return items[Math.min(items.length - 1, Math.floor(boundedRandom(random) * items.length))];
}
function boundedRandom(random: () => number) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new BusinessError("INTERNAL_ERROR", "随机数生成器返回了无效值。");
  return value;
}
