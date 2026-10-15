import type { FaithBusinessCoreScope } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import { MESSAGES } from "../../shared/messages";
import type { GameRoom, GameRoomsApi, RoomEvent, RoomGame, RoomRenderContext, RoomTransaction } from "../rooms";
import { RouletteEngine } from "./engine";
import { registerFields } from "./fields";
import { rouletteText } from "./messages";
import { registerPaths } from "./paths";
import { benefits } from "./progress";
import { pick, secureRandom, shuffle } from "./random";
import { RouletteRegistry } from "./registry";
import { renderRoulette } from "./render";
import { settleRoulette } from "./settlement";
import type { RouletteConfig, RouletteMode, RouletteState } from "./types";
import { initialState, initialStats } from "./types";
export class RouletteService implements RoomGame<RouletteState> {
    readonly id = "roulette";
    readonly rules = new RouletteRegistry();
    private engine = new RouletteEngine(this.rules);
    onCommitted?: (room: Readonly<GameRoom<RouletteState>>) => Promise<void>;
    afterCommit(room: Readonly<GameRoom<RouletteState>>) {
        return this.onCommitted?.(room) ?? Promise.resolve();
    }
    constructor(private core: FaithBusinessCoreScope, private rooms: GameRoomsApi, private config: RouletteConfig) {
        registerPaths(this.rules);
        registerFields(this.rules);
    }
    configure(config: RouletteConfig) {
        this.config = config;
    }
    create(event: RoomEvent, mode: RouletteMode) {
        return this.rooms.create(event, this.id, {
            state: initialState(mode), min: this.config[mode === "normal" ? "normalMin" : mode === "gambler" ? "gamblerMin" : "crazyMin"], max: mode === "normal" ? 12 : mode === "gambler" ? 15 : 16
        });
    }
    command(event: RoomEvent, action: string, args: readonly string[] = []) {
        return this.rooms.command(event, this.id, action, args);
    }
    stats(uid: number) {
        return this.rooms.progress(uid, this.id, initialStats());
    }
    changeHonor(uid: number, delta: number, idempotencyKey?: string) {
        if (!Number.isSafeInteger(delta) || delta === 0)
            throw new BusinessError("INVALID_INPUT", "轮盘荣誉变化必须是非零安全整数。");
        return this.rooms.updateProgress(uid, this.id, initialStats(), (stats) => {
            const next = stats.honor + delta;
            if (!Number.isSafeInteger(next) || next < 0)
                throw new BusinessError("INSUFFICIENT_RESOURCE", "轮盘赌荣誉不足。");
            stats.honor = next;
            return next;
        }, { source: "roulette.change_honor", idempotencyKey });
    }
    async start(room: GameRoom<RouletteState>, tx: RoomTransaction) {
        const s = room.state;
        s.logs = [];
        const orderedMembers = shuffle(room.members, secureRandom);
        for (const [seat, member] of orderedMembers.entries()) {
            const account = tx.player(member.uid), user = await account.user.get(), stats = await account.progress(initialStats());
            const path = this.core.faiths.get(user.faiths[0])?.path ?? "无";
            if (!Number.isSafeInteger(stats.level) || stats.level < 1 || stats.level > 10)
                throw new BusinessError("INVALID_INPUT", "玩家轮盘等级数据异常，请联系创造者。");
            s.players.push({
                uid: member.uid, name: `${seat + 1}号·${member.name}`, path, level: stats.level, alive: true, timeouts: 0, chambers: [], penalty: {}, flags: {
                    disabled: 0, instability: 0, fear: 0, lifeCooldown: 0, lifeSave: 0, lifeUsed: 0, shields: 0,
                }
            });
            member.ticket = s.mode === "crazy" ? { gold: Math.round(this.config.entryFee * (1 - benefits(stats.level).fee)) } : {};
            s.feePool += member.ticket.gold ?? 0;
        }
        const gamblerFields = this.rules.listFields().filter((f) => f.modes?.includes("gambler")).map((f) => f.id);
        const crazyFields = this.rules.listFields().filter((f) => f.modes?.includes("crazy") && !f.modes.includes("gambler")).map((f) => f.id);
        if (s.mode === "gambler")
            s.field = pick(gamblerFields, secureRandom);
        if (s.mode === "crazy") {
            const gambler = secureRandom() < .5;
            s.field = gambler ? pick(gamblerFields, secureRandom) : pick(crazyFields, secureRandom);
            s.extra = gambler ? secureRandom() < .5 ? "take_all" : "whispers" : "";
            if (s.extra === "take_all")
                s.dealer = pick(s.players, secureRandom).uid;
            const paths = shuffle(this.rules.listPaths().map((p) => p.name), secureRandom).slice(0, secureRandom() < .1 ? 1 : 3);
            s.players.forEach((p, i) => {
                p.path = paths[i % paths.length];
            });
        }
        this.engine.start(s);
        this.deadline(room);
        s.logs.unshift(rouletteText.started(s.chambers.filter(Boolean).length, s.chambers.filter((value) => !value).length));
        s.logs.push(...s.players.map((p) => `${p.name}：${p.path}`));
    }
    async action(room: GameRoom<RouletteState>, uid: number, action: string, _args: readonly string[], tx: RoomTransaction) {
        if (!["开枪", "恐惧", "无畏", "退缩"].includes(action) && !this.rules.listPaths().some((p) => p.abilities?.[action]) && !this.rules.listFields().some((p) => p.abilities?.[action]))
            throw new BusinessError("INVALID_INPUT");
        await this.turn(room, uid, action, false, tx);
    }
    async timeout(room: GameRoom<RouletteState>, tx: RoomTransaction) {
        await this.turn(room, room.state.current, "开枪", true, tx);
    }
    finish(room: GameRoom<RouletteState>, tx: RoomTransaction, aborted: boolean) {
        return settleRoulette(room, tx, this.core, aborted);
    }
    render(room: Readonly<GameRoom<RouletteState>>, context?: RoomRenderContext) {
        return renderRoulette(room, this.rules, context);
    }
    announcement(room: Readonly<GameRoom<RouletteState>>) {
        if (room.state.aborted || !room.state.maxLevelUids.length)
            return;
        const names = room.state.players.filter((p) => room.state.maxLevelUids.includes(p.uid)).map((p) => `${p.name}（UID ${p.uid}）`);
        return { id: `roulette:${room.id}:max-level`, content: MESSAGES.roulette.maxLevel(names) };
    }
    private async turn(room: GameRoom<RouletteState>, uid: number, action: string, timeout: boolean, tx: RoomTransaction) {
        if (room.state.field && !this.rules.field(room.state.field))
            throw new BusinessError("MODULE_NOT_READY", "本局场地扩展尚未加载");
        const previousDeaths = new Set(room.state.deaths);
        this.engine.act(room.state, uid, action, timeout);
        for (const p of room.state.players)
            if (!previousDeaths.has(p.uid) && !p.alive) {
                // v2 允许轮盘罚款进入负余额；门票则必须足额支付。
                if (Object.values(p.penalty).some(Boolean))
                    await tx.player(p.uid).user.change({ gold: -(p.penalty.gold ?? 0), ascension_score: -(p.penalty.ascension_score ?? 0) });
                room.state.logs.push(`${p.name}：扣除金币${p.penalty.gold ?? 0}、登神分${p.penalty.ascension_score ?? 0}。`);
            }
        if (room.state.players.filter((p) => p.alive).length <= 1)
            room.status = "ended";
        this.deadline(room);
    }
    private deadline(room: GameRoom<RouletteState>) {
        room.deadline = Date.now() + this.config.turnSeconds * 1000;
    }
}
