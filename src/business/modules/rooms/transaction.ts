import type { FaithAtomicScope } from "cocofaith-sdk/core";
import { createHash } from "node:crypto";
import type { RoomTransaction } from "./types";
interface RoomProgressRow extends Record<string, unknown> {
    key: string;
    active: boolean;
    version: number;
    room: {
        progress: Record<string, unknown>;
    };
}
export const progressKey = (uid: number, owner: string) => createHash("sha256").update(`player:${owner}:${uid}`).digest("hex");
export function roomTransaction(scopes: ReadonlyMap<number, FaithAtomicScope>, owner: string): RoomTransaction {
    const rows = new Map<number, RoomProgressRow | null>();
    return Object.freeze({ player(uid: number) {
            const scope = scopes.get(uid);
            if (!scope)
                throw new Error("事务不能访问未参赛的用户");
            const key = progressKey(uid, owner);
            const load = async () => {
                if (!rows.has(uid)) {
                    const raw = (await scope.table.get<RoomProgressRow>({ key }))[0];
                    rows.set(uid, raw ? validateProgressRow(raw, key) : null);
                }
                return rows.get(uid);
            };
            return Object.freeze({
                user: scope.users, economy: scope.economy, items: scope.items,
                async progress<T extends Record<string, unknown>>(initial: T): Promise<T> {
                    return structuredClone(((await load())?.room.progress as T | undefined) ?? initial);
                },
                async saveProgress(value: Record<string, unknown>) {
                    const previous = await load(), room = { progress: structuredClone(value) }, version = (previous?.version ?? 0) + 1;
                    assertProgressSize(room.progress);
                    if (!previous)
                        await scope.table.create({
                            key, active: false, version, room
                        });
                    else {
                        const result = await scope.table.set({ key, version: previous.version }, { room, version });
                        if (result.matched !== 1)
                            throw new Error("玩家战绩更新冲突");
                    }
                    rows.set(uid, {
                        key, active: false, room, version
                    });
                },
            });
        } });
}
function validateProgressRow(row: RoomProgressRow, key: string): RoomProgressRow {
    if (row.key !== key || !Number.isSafeInteger(row.version) || row.version < 0 || !row.room || typeof row.room !== "object"
        || !row.room.progress || typeof row.room.progress !== "object" || Array.isArray(row.room.progress)) {
        throw new Error("玩家游戏记录格式异常");
    }
    assertProgressSize(row.room.progress);
    return row;
}
function assertProgressSize(value: Record<string, unknown>) {
    let size: number;
    try {
        size = Buffer.byteLength(JSON.stringify(value));
    }
    catch (error) {
        throw new AggregateError([error], "玩家游戏记录无法序列化", { cause: error });
    }
    if (size > 64 * 1024)
        throw new Error("玩家游戏记录超过 64 KiB 上限");
}
