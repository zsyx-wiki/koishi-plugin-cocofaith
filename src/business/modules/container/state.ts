import { BusinessError } from "../../framework/errors";
import { DAILY_DRIP_RATES, INFUSION_RATES } from "./data";
import type { ContainerState } from "./types";
export function initialContainerState(): ContainerState {
    return {
        divinity: 0, lastDripDate: "never", consecrationCharges: 1, lastChargeRecoveryDate: "never"
    };
}
export function normalizeContainerState(value: Readonly<Record<string, unknown>>, maxCharges = 16): ContainerState {
    const finite = (key: string, fallback = 0) => typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0 ? value[key] as number : fallback;
    const string = (key: string) => typeof value[key] === "string" && (value[key] as string).length <= 128 ? value[key] as string : undefined;
    const result: ContainerState = {
        divinity: finite("divinity"),
        lastDripDate: string("lastDripDate") ?? "never",
        consecrationCharges: Math.min(maxCharges, Math.floor(finite("consecrationCharges", 1))),
        lastChargeRecoveryDate: string("lastChargeRecoveryDate") ?? "never",
    };
    const subgodName = string("subgodName"), truegodName = string("truegodName");
    const originalFaith = string("originalFaith"), path = string("path");
    if (subgodName !== undefined)
        result.subgodName = subgodName;
    if (truegodName !== undefined)
        result.truegodName = truegodName;
    if (originalFaith !== undefined)
        result.originalFaith = originalFaith;
    if (path !== undefined)
        result.path = path;
    return result;
}
export function calculateDivinityGain(type: "fragment" | "roulette", amount: number, currentDivinity: number) {
    assertPositiveInteger(amount, "投入数量");
    const tier = INFUSION_RATES.find((entry) => currentDivinity <= entry.maximum) ?? INFUSION_RATES.at(-1)!;
    return amount * tier[type];
}
export function rollDailyDivinity(random: () => number) {
    const value = Math.max(0, Math.min(0.999999999999, random()));
    let cumulative = 0;
    for (const rate of DAILY_DRIP_RATES) {
        cumulative += rate.odds;
        if (value < cumulative)
            return rate.amount;
    }
    return DAILY_DRIP_RATES.at(-1)!.amount;
}
function assertPositiveInteger(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new BusinessError("INVALID_INPUT", `${label}必须是正整数。`);
}
