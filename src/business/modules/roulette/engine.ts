import { BusinessError } from "../../framework/errors";
import { rouletteText } from "./messages";
import { chaos } from "./paths";
import { pick, secureRandom, shuffle, type RandomSource } from "./random";
import { RouletteRegistry, type RouletteEffectContext as Effect } from "./registry";
import type { RoulettePlayer as Player, RouletteState as State } from "./types";
export class RouletteEngine {
    constructor(readonly rules: RouletteRegistry, private random: RandomSource = secureRandom) {
    }
    start(s: State) {
        s.order = s.players.map((p) => p.uid);
        s.current = s.order[0];
        for (const p of s.players)
            this.rules.emit("start", this.context(s, p, p));
        this.reload(s);
    }
    act(s: State, uid: number, ability = "开枪", timeout = false) {
        const actor = this.player(s, s.current);
        if (uid !== actor.uid)
            throw new BusinessError("NOT_ALLOWED", `还没轮到你，当前是 ${actor.name}。`);
        s.logs = [];
        const c = this.context(s, actor, actor);
        if (timeout) {
            actor.timeouts++;
            s.logs.push(rouletteText.timeout(actor.name, actor.timeouts));
            if (actor.timeouts >= 2) {
                s.logs.push(rouletteText.timeoutDeath(actor.name));
                this.kill(s, actor, "被恶魔直接处决", true);
                this.advance(s, actor);
                return;
            }
        }
        if (ability !== "开枪") {
            try {
                this.rules.ability(ability, c);
            }
            catch (error) {
                throw new BusinessError("NOT_ALLOWED", (error as Error).message);
            }
        }
        const mad = s.field === "crazy" && s.demon === actor.uid;
        const previousFlags = new Map(s.players.map((p) => [p.uid, p.flags.disabled]));
        if (mad) {
            for (const p of s.players)
                p.flags.disabled = 1;
            for (let n = 0; n < 128 && s.chambers.length && this.alive(s).length > 1 && actor.alive; n++) {
                c.target = pick(this.alive(s), this.random);
                c.damage = 3;
                this.shoot(c);
                if (c.bullet)
                    break;
            }
            for (const p of s.players)
                p.flags.disabled = previousFlags.get(p.uid) ?? 0;
        }
        else {
            this.rules.emit("beforeShot", c);
            // 被混沌场地选中的混沌玩家仍可发动自身效果，但不反复递归重定向。
            if (c.target.path === "混沌" && !c.tags.has("chaos_path") && !c.target.flags.disabled)
                chaos(c);
            if (!c.cancelled && actor.alive)
                this.shoot(c);
        }
        if (s.seal?.target === actor.uid) {
            const source = s.players.find((p) => p.uid === s.seal!.source);
            if (source?.alive)
                source.flags.civilizationSave = 1;
            s.seal = undefined;
        }
        this.next(s, actor);
        this.rules.emit("afterShot", c);
        actor.flags.disabled = 0;
        this.finishTurn(s);
    }
    private shoot(c: Effect) {
        const s = c.state, target = c.target;
        if (!target.alive || !c.actor.alive)
            return;
        if (s.extra === "whispers" && s.fear >= 10 && this.random() < s.fear * .02) {
            this.kill(s, c.actor, "低语处决", true);
            return;
        }
        const chambers = target.path === "存在" && !target.flags.disabled && target.chambers.length ? target.chambers : s.chambers;
        if (!chambers.length)
            return;
        c.bullet = chambers.shift()!;
        c.damage = s.field === "crazy" ? (s.demon === c.actor.uid ? 3 : 2) : 1;
        s.logs.push(c.bullet ? rouletteText.bullet(target.name) : rouletteText.empty(target.name));
        if (s.extra === "whispers")
            s.fear = Math.min(20, s.fear + (c.bullet ? 2 : 1));
        if (c.bullet) {
            this.rules.emit("bullet", c);
            if (!Number.isSafeInteger(c.damage) || c.damage < 0)
                throw new Error("轮盘规则产生了无效伤害");
            if (c.damage > 0)
                this.kill(s, target, "实弹淘汰");
        }
        else
            this.rules.emit("empty", c);
        if (s.field === "crazy_madness") {
            if (this.random() < .15) {
                const candidates = this.alive(s).filter((p) => p.uid !== c.actor.uid);
                if (candidates.length) {
                    this.kill(s, pick(candidates, this.random), "癫狂随机淘汰", true);
                    if (this.random() < .55)
                        c.addBullet();
                }
            }
            if (c.bullet && this.random() < .1) {
                const candidates = this.alive(s).filter((p) => p.uid !== c.actor.uid);
                if (candidates.length)
                    this.kill(s, pick(candidates, this.random), "癫狂连锁淘汰", true);
            }
        }
    }
    private kill(s: State, p: Player, reason: string, forced = false) {
        if (!p.alive)
            return;
        p.alive = false;
        s.deaths.push(p.uid);
        s.logs.push(rouletteText.death(p.name, reason));
        const base = s.mode === "crazy" ? [150, 75] : s.mode === "gambler" ? [20, 10] : s.firstBlood && !forced ? [10, 2] : [0, 0];
        if (s.mode === "normal" && !forced)
            s.firstBlood = false;
        const multiplier = s.extra === "take_all" && p.uid === s.dealer ? s.players.length - 1 : 1;
        const step = p.level >= 10 ? 10 : p.level - 1;
        p.penalty = { gold: Math.round(base[0] * multiplier * (1 - step * .04)), ascension_score: Math.round(base[1] * multiplier * (1 - step * .04)) };
        // 奖池采用实际罚款，等级减免不会凭空补进奖池。
        s.pool.gold += p.penalty.gold!;
        s.pool.ascension_score += p.penalty.ascension_score!;
        if (s.extra === "whispers")
            s.fear = Math.min(20, Math.max(0, s.fear + (this.random() < .5 ? -4 : 2)));
        if (s.seal?.target === p.uid) {
            const i = s.order.indexOf(p.uid), next = [...s.order.slice(i + 1), ...s.order.slice(0, i)].map((id) => this.player(s, id)).find((x) => x.alive);
            if (next) {
                next.flags.disabled = 1;
                s.seal.target = next.uid;
            }
            else
                s.seal = undefined;
        }
        this.rules.emit("death", this.context(s, p, p));
    }
    private advance(s: State, actor: Player) {
        this.next(s, actor);
        this.finishTurn(s);
    }
    private next(s: State, actor: Player) {
        const index = s.order.indexOf(actor.uid);
        s.current = [...s.order.slice(index + 1), ...s.order.slice(0, index + 1)].find((id) => this.player(s, id).alive) ?? 0;
    }
    private finishTurn(s: State) {
        s.turn++;
        if (this.alive(s).length > 1 && !s.chambers.length)
            this.reload(s);
        if (s.current && !this.player(s, s.current).alive)
            s.current = this.alive(s)[0]?.uid ?? 0;
        this.validate(s);
        s.logs = s.logs.slice(-24);
    }
    private reload(s: State) {
        s.round++;
        if (s.round > 1 && s.field === "void" && this.alive(s).length > 1 && this.random() < .66)
            this.kill(s, pick(this.alive(s), this.random), "虚无场地淘汰", true);
        const living = this.alive(s), n = living.length;
        if (n <= 1)
            return;
        s.chambers = shuffle([...Array(Math.max(1, Math.min(5, Math.floor(n / 2)))).fill(true), ...Array(Math.max(1, n - 1)).fill(false)], this.random);
        if (s.field === "crazy")
            s.demon = pick(living, this.random).uid;
        if (s.extra === "whispers")
            s.fear = Math.max(0, s.fear - 5);
        for (const p of living) {
            p.flags.retreat = 0;
            this.rules.emit("reload", this.context(s, p, p));
        }
        s.logs.push(rouletteText.reload(s.chambers.filter(Boolean).length, s.chambers.filter((b) => !b).length));
    }
    private context(s: State, actor: Player, target: Player): Effect {
        return {
            state: s, actor, target, random: this.random, damage: 1, cancelled: false, bullet: false, messages: s.logs, tags: new Set(),
            kill: (p, reason, forced) => this.kill(s, p, reason, forced),
            addEmpty: () => {
                s.chambers.push(false);
                s.chambers = shuffle(s.chambers, this.random);
            },
            addBullet: () => {
                const i = s.chambers.indexOf(false);
                if (i < 0)
                    s.chambers.push(true);
                else
                    s.chambers[i] = true;
                s.chambers = shuffle(s.chambers, this.random);
            },
        };
    }
    private player(s: State, uid: number) {
        const p = s.players.find((p) => p.uid === uid);
        if (!p)
            throw new Error("轮盘行动者不存在");
        return p;
    }
    private alive(s: State) {
        return s.players.filter((p) => p.alive);
    }
    private validate(s: State) {
        if (s.chambers.length > 256 || s.players.some((p) => p.chambers.length > 256))
            throw new Error("轮盘弹仓超过安全上限");
        for (const p of s.players)
            for (const value of Object.values(p.penalty))
                if (!Number.isSafeInteger(value) || value! < 0)
                    throw new Error("轮盘罚款无效");
    }
}
