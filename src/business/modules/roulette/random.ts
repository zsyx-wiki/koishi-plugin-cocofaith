import { randomInt } from "node:crypto";
export type RandomSource = () => number;
export const secureRandom: RandomSource = () => randomInt(0x100000000) / 0x100000000;
export function pick<T>(values: readonly T[], random: RandomSource): T {
    if (!values.length)
        throw new Error("不能从空集合随机抽取");
    const value = random();
    if (!(value >= 0 && value < 1))
        throw new Error("随机源必须返回 [0,1)");
    return values[Math.floor(value * values.length)];
}
export function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
