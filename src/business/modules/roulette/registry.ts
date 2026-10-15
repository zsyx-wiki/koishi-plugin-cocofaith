import { resolveProtections, type RouletteProtection } from "./protection";
import type { RandomSource } from "./random";
import type { RoulettePlayer, RouletteState } from "./types";
export type RoulettePhase = "start" | "reload" | "beforeShot" | "bullet" | "empty" | "afterShot" | "death";
export interface RouletteEffectContext {
    state: RouletteState;
    actor: RoulettePlayer;
    target: RoulettePlayer;
    random: RandomSource;
    damage: number;
    cancelled: boolean;
    bullet: boolean;
    messages: string[];
    tags: Set<string>;
    kill(player: RoulettePlayer, reason: string, forced?: boolean): void;
    addBullet(): void;
    addEmpty(): void;
}
export interface RouletteRule {
    id: string;
    name: string;
    description: string;
    modes?: readonly ("gambler" | "crazy")[];
    savesAsShields?: boolean;
    protections?: readonly RouletteProtection[];
    hooks?: Partial<Record<RoulettePhase, (context: RouletteEffectContext) => void>>;
    abilities?: Record<string, (context: RouletteEffectContext) => void>;
}
export class RouletteRegistry {
    private paths = new Map<string, Readonly<RouletteRule>>();
    private fields = new Map<string, Readonly<RouletteRule>>();
    private hooks: Array<{
        id: string;
        phase: RoulettePhase;
        priority: number;
        apply: (context: RouletteEffectContext) => void;
    }> = [];
    registerPath(rule: RouletteRule) {
        return this.register(this.paths, rule.name, rule);
    }
    registerField(rule: RouletteRule) {
        return this.register(this.fields, rule.id, rule);
    }
    path(name: string) {
        return this.paths.get(name);
    }
    field(id: string) {
        return this.fields.get(id);
    }
    listPaths() {
        return [...this.paths.values()];
    }
    listFields() {
        return [...this.fields.values()];
    }
    registerHook(hook: {
        id: string;
        phase: RoulettePhase;
        priority?: number;
        apply: (context: RouletteEffectContext) => void;
    }) {
        if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(hook.id) || !Number.isFinite(hook.priority ?? 0) || typeof hook.apply !== "function"
            || !["start", "reload", "beforeShot", "bullet", "empty", "afterShot", "death"].includes(hook.phase))
            throw new Error("轮盘 Hook 定义无效");
        if (this.hooks.some((item) => item.id === hook.id))
            throw new Error("轮盘 Hook ID 重复");
        const entry = Object.freeze({ ...hook, priority: hook.priority ?? 0 });
        this.hooks = [...this.hooks, entry].sort((a, b) => a.priority - b.priority);
        return { dispose: () => {
                this.hooks = this.hooks.filter((item) => item !== entry);
            } };
    }
    emit(phase: RoulettePhase, context: RouletteEffectContext) {
        const field = this.field(context.state.field);
        this.invoke(field?.hooks?.[phase], context);
        const player = phase === "beforeShot" || phase === "afterShot" ? context.actor : context.target;
        if (!player.flags.disabled)
            this.invoke(this.path(player.path)?.hooks?.[phase], context);
        for (const hook of this.hooks)
            if (hook.phase === phase)
                this.invoke(hook.apply, context);
        if (phase === "bullet") {
            const sources = [...(field?.protections ?? [])];
            if (!context.target.flags.disabled)
                sources.push(...(this.path(context.target.path)?.protections ?? []), civilizationProtection);
            if (context.state.extra === "take_all" && context.target.uid === context.state.dealer)
                sources.push(dealerProtection);
            if (!Number.isSafeInteger(context.damage) || context.damage < 0)
                throw new Error("轮盘规则产生了无效伤害");
            resolveProtections(context, sources, !!field?.savesAsShields);
        }
    }
    ability(name: string, context: RouletteEffectContext) {
        if (context.actor.flags.disabled)
            throw new Error("本回合能力已被封锁");
        const ability = this.path(context.actor.path)?.abilities?.[name] ?? this.field(context.state.field)?.abilities?.[name];
        if (!ability)
            throw new Error("当前命途或场地不能使用此能力");
        this.invoke(ability, context);
    }
    private invoke(fn: ((context: RouletteEffectContext) => void) | undefined, context: RouletteEffectContext) {
        if (!fn)
            return;
        const result = fn(context) as unknown;
        if (result && typeof (result as Promise<unknown>).then === "function") {
            void Promise.resolve(result).catch(() => {
            });
            throw new Error("轮盘规则 Hook 必须同步，不得在规则计算中执行 IO");
        }
    }
    private register(map: Map<string, Readonly<RouletteRule>>, key: string, rule: RouletteRule) {
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(rule.id) || !key || map.has(key))
            throw new Error("轮盘规则 ID 无效或重复");
        if ([...map.values()].some((item) => item.id === rule.id))
            throw new Error("轮盘规则 ID 重复");
        const ids = new Set<string>();
        for (const source of rule.protections ?? []) {
            if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(source.id) || ids.has(source.id)
                || !["shield", "save"].includes(source.kind) || typeof source.available !== "function"
                || typeof source.probability !== "function" || typeof source.consume !== "function")
                throw new Error("轮盘保护来源无效或重复");
            ids.add(source.id);
        }
        const value = Object.freeze({
            ...rule, protections: Object.freeze((rule.protections ?? []).map((source) => Object.freeze({ ...source }))), modes: Object.freeze([...(rule.modes ?? ["gambler", "crazy"])]), hooks: Object.freeze({ ...rule.hooks }), abilities: Object.freeze({ ...rule.abilities })
        });
        map.set(key, value);
        return value;
    }
}
const civilizationProtection: RouletteProtection = {
    id: "civilization.save", kind: "save", available: (c) => c.target.flags.civilizationSave || 0, probability: () => .5,
    consume(c, layers) {
        c.target.flags.civilizationSave -= layers;
        c.messages.push("文明庇护触发。");
    },
};
const dealerProtection: RouletteProtection = {
    id: "dealer.save", kind: "save", available: () => 1,
    probability: (c) => Math.min(1, .47 + (c.state.players.filter((p) => p.alive).length - 1) / 100),
    consume(c) {
        c.messages.push("庄家通吃：保命成功。");
    },
};
