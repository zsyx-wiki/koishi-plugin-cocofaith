import type { RouletteEffectContext } from "./registry";
export interface RouletteProtection {
    id: string;
    kind: "shield" | "save";
    fallback?: boolean;
    available(context: RouletteEffectContext): number;
    probability(context: RouletteEffectContext): number;
    consume(context: RouletteEffectContext, layers: number): void;
}
export function resolveProtections(context: RouletteEffectContext, sources: readonly RouletteProtection[], savesAsShields: boolean) {
    const seen = new Set<string>();
    const ordered = sources.map((source, index) => ({ source, index }))
        .sort((a, b) => rank(a.source) - rank(b.source) || a.index - b.index);
    for (const { source } of ordered) {
        if (context.damage <= 0)
            break;
        if (seen.has(source.id))
            continue;
        seen.add(source.id);
        const layers = source.available(context);
        if (!Number.isSafeInteger(layers) || layers < 0)
            throw new Error(`护盾层数无效：${source.id}`);
        if (!layers)
            continue;
        const chance = source.probability(context);
        if (!Number.isFinite(chance) || chance < 0 || chance > 1)
            throw new Error(`护盾概率无效：${source.id}`);
        if (chance === 0 || chance < 1 && context.random() >= chance)
            continue;
        const used = source.kind === "save" && !savesAsShields ? 1 : Math.min(layers, context.damage);
        const effect = source.consume(context, used) as unknown;
        if (effect && typeof (effect as Promise<unknown>).then === "function") {
            void Promise.resolve(effect).catch(() => {
            });
            throw new Error(`护盾回调必须同步：${source.id}`);
        }
        context.damage = source.kind === "save" && !savesAsShields ? 0 : context.damage - used;
    }
}
function rank(source: RouletteProtection) {
    return source.fallback ? 2 : source.kind === "shield" ? 0 : 1;
}
