import type { FaithBusinessCoreScope } from "cocofaith-sdk/core";
import { Logger } from "koishi";
import { createHash, randomUUID } from "node:crypto";
import { BusinessError } from "../../framework/errors";
import type { BusinessResult } from "../../framework/types";
import { progressKey, roomTransaction } from "./transaction";
import type { CreateRoom, GameRoom, ProgressUpdateOptions, RoomEvent, RoomGame } from "./types";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
interface RoomTableRow extends Record<string, unknown> {
    key: string;
    active: boolean;
    version: number;
    room: GameRoom;
}
interface RoomProgressTableRow extends Record<string, unknown> {
    key: string;
    active: boolean;
    version: number;
    room: {
        progress: Record<string, unknown>;
    };
}
export type GameRoomsApi = Pick<GameRoomService, "register" | "create" | "command" | "progress" | "updateProgress">;
export class GameRoomService {
    private games = new Map<string, RoomGame>();
    private rooms = new Map<string, GameRoom>();
    private queues = new Map<string, Promise<unknown>>();
    private timers = new Map<string, ReturnType<typeof setTimeout>>();
    private replies = new Map<string, NonNullable<RoomEvent["reply"]>>();
    private stopped = false;
    private logger = new Logger("cocofaith-business-room");
    constructor(private core: FaithBusinessCoreScope) {
    }
    async load() {
        for (const row of await this.core.table.get<RoomTableRow>({ active: true })) {
            try {
                const room = readRoom(row, row.key);
                this.rooms.set(row.key, room);
            }
            catch (error) {
                this.logger.error(`忽略损坏的房间数据 key=${String(row.key).slice(0, 80)}`, error);
            }
        }
    }
    register(game: RoomGame) {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(game.id) || this.games.has(game.id))
            throw new BusinessError("CONFLICT", "游戏房间类型重复或无效");
        this.games.set(game.id, game);
        for (const room of this.rooms.values())
            if (room.owner === game.id)
                this.schedule(room);
        return { dispose: async () => {
                this.games.delete(game.id);
                for (const room of this.rooms.values())
                    if (room.owner === game.id)
                        this.clearTimer(room.key);
                await Promise.allSettled([...this.queues.values()]);
            } };
    }
    async close() {
        this.stopped = true;
        for (const key of this.timers.keys())
            this.clearTimer(key);
        await Promise.allSettled([...this.queues.values()]);
        this.replies.clear();
    }
    key(event: RoomEvent) {
        if (event.scene !== "group" || !event.roomKey || !event.uid)
            throw new BusinessError("INVALID_INPUT", "此功能需要支持游戏房间的群聊适配器");
        return hash(event.roomKey);
    }
    async create<S extends object>(event: RoomEvent, owner: string, options: CreateRoom<S>): Promise<BusinessResult> {
        const key = this.key(event);
        return this.serial(key, async () => {
            this.requireGame(owner);
            if (!Number.isInteger(options.min) || !Number.isInteger(options.max) || options.min < 2 || options.max > 32 || options.max < options.min)
                throw new BusinessError("INVALID_INPUT");
            const [old] = await this.core.table.get<RoomTableRow>({ key });
            if (old?.active) {
                readRoom(old, key);
                throw new BusinessError("ROOM_OCCUPIED", "本群已有游戏房间，请先完成或解散当前房间。");
            }
            const room: GameRoom = {
                id: randomUUID(), key, owner, creator: event.uid!, status: "waiting", version: (old?.version ?? 0) + 1,
                min: options.min, max: options.max, members: [{
                        uid: event.uid!, name: this.name(event), ticket: {}
                    }],
                state: structuredClone(options.state), deadline: Date.now() + 15 * 60000, createdAt: Date.now(), seen: [], log: ["房间已创建，等待玩家加入。"]
            };
            this.rememberEvent(room, event);
            readRoom({
                key, active: true, version: room.version, room
            }, key);
            await this.core.transaction.run(event.uid!, async (scope) => {
                if (old) {
                    const result = await scope.table.set({
                        key, version: old.version, active: false
                    }, {
                        active: true, version: room.version, room
                    });
                    if (result.matched !== 1)
                        throw new BusinessError("CONFLICT");
                }
                else
                    await scope.table.create({
                        key, active: true, version: room.version, room
                    });
            }, { source: "rooms.create" });
            this.rooms.set(key, room);
            this.bind(room, event);
            this.schedule(room);
            this.logger.info(`创建房间 owner=${owner} id=${room.id} uid=${room.creator}`);
            return this.requireGame(owner).render(room);
        });
    }
    async command(event: RoomEvent, owner: string, action: string, args: readonly string[] = []): Promise<BusinessResult> {
        const key = this.key(event);
        return this.serial(key, () => this.change(key, owner, action, event, args));
    }
    async progress<T extends Record<string, unknown>>(uid: number, game: string, initial: T): Promise<T> {
        this.requireGame(game);
        const [row] = await this.core.table.get<RoomProgressTableRow>({ key: progressKey(uid, game) });
        return structuredClone(row ? readProgress(row) as T : initial);
    }
    /**
     * 由房间模块持有战绩表的事务边界，其他玩法只能通过该方法修改自己的战绩。
     * 这避免跨模块直接访问 rooms 私有表。
     */
    updateProgress<T extends Record<string, unknown>, R>(uid: number, game: string, initial: T, update: (progress: T) => R | Promise<R>, options: ProgressUpdateOptions = {}) {
        this.requireGame(game);
        return this.core.transaction.run(uid, async (scope) => {
            const player = roomTransaction(new Map([[uid, scope]]), game).player(uid);
            const progress = await player.progress(initial);
            const result = await update(progress);
            await player.saveProgress(progress);
            return result;
        }, {
            source: options.source ?? `rooms.progress.${game}`,
            idempotencyKey: options.idempotencyKey,
        });
    }
    private async change(key: string, owner: string, action: string, event?: RoomEvent, args: readonly string[] = [], expected?: number): Promise<BusinessResult> {
        const game = this.requireGame(owner);
        const [row] = await this.core.table.get<RoomTableRow>({ key });
        if (!row)
            throw new BusinessError("NOT_FOUND", "本群没有这类游戏房间。");
        const previous = readRoom(row, key);
        if (previous.owner !== owner)
            throw new BusinessError("NOT_FOUND", "本群没有这类游戏房间。");
        if (expected !== undefined && (previous.version !== expected || previous.status === "ended")) {
            if (previous.status !== "ended") {
                this.rooms.set(key, previous);
                this.schedule(previous);
            }
            return { type: "silent" };
        }
        if (event && this.hasEvent(previous, event))
            return game.render(previous, { action, uid: event.uid ?? undefined });
        if (action === "view" || previous.status === "ended") {
            if (event && previous.members.some((p) => p.uid === event.uid))
                this.bind(previous, event);
            return game.render(previous);
        }
        const room = structuredClone(previous), uid = event?.uid;
        const participant = room.members.some((p) => p.uid === uid);
        if (action === "force_abort" && !await this.core.permissions.check(uid!, "faith.creator"))
            throw new BusinessError("NOT_ALLOWED");
        if (event && !participant && action !== "join" && action !== "force_abort")
            throw new BusinessError("NOT_ALLOWED", "你没有加入本局。");
        if (event && participant)
            this.bind(previous, event);
        const ids = [...room.members.map((p) => p.uid), ...(action === "join" && uid ? [uid] : [])];
        await this.core.transaction.runMany(ids, async (scopes) => {
            const table = scopes.values().next().value!.table;
            const [current] = await table.get({ key, version: previous.version });
            if (!current)
                throw new BusinessError("CONFLICT", "对局已更新，请重试。");
            const tx = roomTransaction(scopes, owner);
            if (action === "join") {
                if (room.status !== "waiting")
                    throw new BusinessError("NOT_ALLOWED", "游戏已经开始。");
                if (participant)
                    throw new BusinessError("CONFLICT", "你已经在房间内。");
                if (room.members.length >= room.max)
                    throw new BusinessError("CONFLICT", "房间已满。");
                room.members.push({
                    uid: uid!, name: this.name(event!), ticket: {}
                });
                room.log = ["玩家加入房间。"];
            }
            else if (action === "leave") {
                if (room.status !== "waiting" || uid === room.creator)
                    throw new BusinessError("NOT_ALLOWED", "仅等待中的非房主玩家可以退出。");
                room.members = room.members.filter((p) => p.uid !== uid);
                room.log = ["玩家已退出。"];
            }
            else if (action === "start") {
                if (uid !== room.creator || room.status !== "waiting")
                    throw new BusinessError("NOT_ALLOWED", "只有房主可以开始等待中的游戏。");
                if (room.members.length < room.min)
                    throw new BusinessError("NOT_ALLOWED", `至少需要 ${room.min} 人。`);
                await game.start(room, tx);
                // 门票在开始时一并扣除；任何一人余额不足，整次开局回滚。
                for (const member of room.members)
                    if (Object.values(member.ticket).some(Boolean))
                        await tx.player(member.uid).economy.pay(member.ticket);
                room.status = "playing";
            }
            else if (action === "abort") {
                if (room.status !== "waiting")
                    throw new BusinessError("NOT_ALLOWED", "进行中的对局只能由创造者强制结束。");
                if (uid !== room.creator)
                    throw new BusinessError("NOT_ALLOWED", "只有房主可以解散。");
                room.status = "ended";
                room.log = ["房间已解散。"];
            }
            else if (action === "force_abort") {
                await game.finish(room, tx, true);
                room.status = "ended";
                room.log = ["对局已中止，已按记录返还费用。"];
            }
            else if (action === "timeout" && room.status === "waiting") {
                room.status = "ended";
                room.log = ["等待超时，房间已解散。"];
            }
            else {
                if (room.status !== "playing")
                    throw new BusinessError("NOT_ALLOWED", "请先开始游戏。");
                if (action === "timeout" || Date.now() >= room.deadline)
                    await game.timeout(room, tx);
                else
                    await game.action(room, uid!, action, args, tx);
                if ((room as GameRoom).status === "ended")
                    await game.finish(room, tx, false);
            }
            room.version++;
            if (room.id !== previous.id || room.key !== key || room.owner !== owner || room.creator !== previous.creator
                || !room.members.some((member) => member.uid === room.creator)
                || room.members.some((member) => !ids.includes(member.uid)))
                throw new Error("游戏规则修改了不可变房间字段或加入了事务外用户");
            readRoom({
                key, active: room.status !== "ended", version: room.version, room
            }, key);
            if (event)
                this.rememberEvent(room, event);
            const result = await table.set({ key, version: previous.version }, {
                version: room.version, active: room.status !== "ended", room
            });
            if (result.matched !== 1)
                throw new BusinessError("CONFLICT");
        }, {
            source: `rooms.${action}`, operatorUid: uid ?? undefined,
            idempotencyKey: event?.eventId ? `room:${key}:${this.eventKey(event)}` : `room:${previous.id}:${previous.version}:${action}`
        });
        this.rooms.set(key, room);
        if (event)
            this.bind(room, event);
        this.schedule(room);
        this.logger.debug(`房间推进 id=${room.id} version=${room.version} action=${action} status=${room.status}`);
        if (room.status === "ended") {
            this.rooms.delete(key);
            this.replies.delete(key);
            this.logger.info(`房间结束 id=${room.id}`);
        }
        try {
            await game.afterCommit?.(room);
        }
        catch (error) {
            this.logger.error(`房间结算附加奖励失败 id=${room.id}`, error);
        }
        const result = game.render(room, { action, uid: uid ?? undefined });
        if (room.status === "ended") {
            const broadcast = game.announcement?.(room);
            if (broadcast)
                return { ...result, broadcast };
        }
        return result;
    }
    private bind(room: GameRoom, event: RoomEvent) {
        if (event.reply && room.status !== "ended")
            this.replies.set(room.key, event.reply);
    }
    private schedule(room: GameRoom) {
        this.clearTimer(room.key);
        if (this.stopped || room.status === "ended" || !this.games.has(room.owner))
            return;
        const timer = setTimeout(() => {
            if (this.timers.get(room.key) === timer)
                this.timers.delete(room.key);
            let reply: RoomEvent["reply"];
            void this.serial(room.key, () => {
                reply = this.replies.get(room.key);
                return this.change(room.key, room.owner, "timeout", undefined, [], room.version);
            })
                .then(async (result) => {
                try {
                    await reply?.(result);
                }
                catch (error) {
                    this.logger.warn(`房间消息发送失败（不影响对局）id=${room.id}`, error);
                }
            })
                .catch((error) => {
                this.logger.error(`房间定时任务失败 id=${room.id}`, error);
                const current = this.rooms.get(room.key);
                if (current && !this.stopped) {
                    const retry = setTimeout(() => this.schedule(current), 5000);
                    retry.unref?.();
                    this.timers.set(room.key, retry);
                }
            });
        }, Math.max(1, Math.min(2147483647, room.deadline - Date.now())));
        timer.unref?.();
        this.timers.set(room.key, timer);
    }
    private clearTimer(key: string) {
        const timer = this.timers.get(key);
        if (timer)
            clearTimeout(timer);
        this.timers.delete(key);
    }
    private requireGame(owner: string) {
        const game = this.games.get(owner);
        if (!game || this.stopped)
            throw new BusinessError("MODULE_NOT_READY");
        return game;
    }
    private name(event: RoomEvent) {
        return (event.displayName || `UID ${event.uid}`).replace(/[\r\n<>]/g, "").slice(0, 24);
    }
    private eventKey(event: RoomEvent) {
        return event.eventId ? hash(`${event.uid}:${event.eventId}`) : "";
    }
    private hasEvent(room: GameRoom, event: RoomEvent) {
        const key = this.eventKey(event);
        return !!key && room.seen.includes(key);
    }
    private rememberEvent(room: GameRoom, event: RoomEvent) {
        const key = this.eventKey(event);
        if (key)
            room.seen = [...room.seen.slice(-127), key];
    }
    private async serial<T>(key: string, task: () => Promise<T>): Promise<T> {
        const next = (this.queues.get(key) ?? Promise.resolve()).catch(() => {
        }).then(task);
        this.queues.set(key, next);
        try {
            return await next;
        }
        finally {
            if (this.queues.get(key) === next)
                this.queues.delete(key);
        }
    }
}
function readRoom(row: RoomTableRow, expectedKey: string): GameRoom {
    const room = row.room;
    const validMember = (member: unknown): boolean => {
        if (!member || typeof member !== "object")
            return false;
        const value = member as Record<string, unknown>;
        if (!Number.isSafeInteger(value.uid) || typeof value.name !== "string" || !value.name || value.name.length > 24
            || !value.ticket || typeof value.ticket !== "object" || Array.isArray(value.ticket))
            return false;
        const ticket = value.ticket as Record<string, unknown>;
        return Object.entries(ticket).every(([key, amount]) => (key === "gold" || key === "ascension_score") && Number.isSafeInteger(amount) && Number(amount) >= 0);
    };
    let bytes: number;
    try {
        bytes = Buffer.byteLength(JSON.stringify(room));
    }
    catch (error) {
        throw new BusinessError("INTERNAL_ERROR", "游戏房间数据无法序列化。", undefined, { cause: error });
    }
    if (!room || typeof room !== "object" || room.key !== expectedKey || row.key !== expectedKey || room.version !== row.version
        || typeof room.id !== "string" || !room.id || room.id.length > 128 || typeof room.owner !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(room.owner)
        || !Number.isSafeInteger(room.creator) || !["waiting", "playing", "ended"].includes(room.status)
        || !room.state || typeof room.state !== "object" || Array.isArray(room.state)
        || !Number.isSafeInteger(room.min) || !Number.isSafeInteger(room.max) || room.min < 2 || room.max < room.min || room.max > 32
        || !Array.isArray(room.members) || !room.members.length || room.members.length > room.max || room.members.some((member) => !validMember(member))
        || new Set(room.members.map((member) => member.uid)).size !== room.members.length
        || !Number.isSafeInteger(room.deadline) || room.deadline < 0 || !Number.isSafeInteger(room.createdAt) || room.createdAt < 0
        || !Array.isArray(room.seen) || room.seen.length > 128 || room.seen.some((value) => typeof value !== "string")
        || !Array.isArray(room.log) || room.log.length > 256 || room.log.some((value) => typeof value !== "string") || bytes > 128 * 1024) {
        throw new BusinessError("INTERNAL_ERROR", "游戏房间数据异常，请联系管理员处理。");
    }
    return room;
}
function readProgress(row: RoomProgressTableRow): Record<string, unknown> {
    const room = row.room;
    if (!room || typeof room !== "object" || !room.progress || typeof room.progress !== "object" || Array.isArray(room.progress)) {
        throw new BusinessError("INTERNAL_ERROR", "玩家游戏记录格式异常。");
    }
    return room.progress;
}
