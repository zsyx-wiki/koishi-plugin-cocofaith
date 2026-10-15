import type { FaithAtomicScope, FaithBusinessCoreScope, FaithStatusIdentityState } from "cocofaith-sdk/core";
import { Logger } from "koishi";
import { BusinessError } from "../../framework/errors";
import type { TitleServiceApi } from "../title";
import type { ClubConfig } from "./config";
import { CLUB_IDENTITY_ID, CLUB_LEVELS, levelFor, qualifyingTitles } from "./data";
import type { ClubLevel, ClubPool, ClubStats, ClubStatus, ClubTableRow } from "./types";
const POOL_KEY = "pool";
export class ClubService {
    private readonly logger = new Logger("cocofaith-business-club");
    constructor(private readonly core: FaithBusinessCoreScope, private readonly titles: TitleServiceApi, private config: Readonly<ClubConfig>) {
    }
    configure(config: Readonly<ClubConfig>) {
        this.config = config;
    }
    async initialize() {
        const [pool] = await this.core.table.get<ClubTableRow>({ key: POOL_KEY });
        if (!pool) {
            try {
                await this.core.table.create(poolRow());
            }
            catch (error) {
                const [created] = await this.core.table.get<ClubTableRow>({ key: POOL_KEY });
                if (!created)
                    throw error;
            }
        }
    }
    async status(uid: number): Promise<ClubStatus | null> {
        const state = await this.core.statusIdentities.state(uid, CLUB_IDENTITY_ID);
        return state ? statusFromState(state) : null;
    }
    async pool(): Promise<ClubPool> {
        const [row] = await this.core.table.get<ClubTableRow>({ key: POOL_KEY });
        return Object.freeze({ gold: safeAmount(row?.gold), ascension: safeAmount(row?.ascension_score) });
    }
    async join(uid: number, requestId?: string) {
        const previous = await this.status(uid);
        if (previous?.active && previous.duesEnabled)
            throw new BusinessError("CONFLICT", "你已经是椰汁俱乐部会员了。");
        const now = new Date(), date = this.core.gameDay.currentDate(now);
        const result = await this.core.transaction.run(uid, async (tx) => {
            const current = await tx.statusIdentities.get(CLUB_IDENTITY_ID);
            const currentStatus = current ? statusFromState(current) : null;
            if (currentStatus?.active && currentStatus.duesEnabled)
                throw new BusinessError("CONFLICT", "你已经是椰汁俱乐部会员了。");
            const first = !current, stats = current ? readStats(current.parameters) : emptyStats(now);
            const charged = first || stats.lastFeeDate !== date;
            const cost = first
                ? { gold: this.config.firstGoldFee, ascension_score: this.config.firstAscensionFee }
                : { gold: this.config.dailyGoldFee, ascension_score: this.config.dailyAscensionFee };
            if (charged && (cost.gold || cost.ascension_score))
                await tx.economy.pay(cost);
            const next = { ...(charged ? advance(stats, cost.gold, cost.ascension_score, date) : stats), duesEnabled: true };
            const level = levelFor(next);
            if (level === "hall")
                next.hallUnlocked = true;
            if (charged)
                await addToPool(tx, poolCredit(cost.gold, this.config.poolRate), poolCredit(cost.ascension_score, this.config.poolRate));
            const state = await tx.statusIdentities.set(CLUB_IDENTITY_ID, {
                level, active: true, parameters: next
            });
            return {
                first, charged, cost, status: statusFromState(state)
            };
        }, { source: previous ? "club.rejoin" : "club.join", idempotencyKey: requestId ? `club:join:${requestId}` : undefined });
        const titles = await this.awardTitles(uid, result.status.stats);
        this.logger.info("会员加入 uid=%s kind=%s charged=%s level=%s gold=%s ascension=%s", uid, result.first ? "first" : "rejoin", result.charged, result.status.level, result.charged ? result.cost.gold : 0, result.charged ? result.cost.ascension_score : 0);
        return {
            kind: result.first ? "first" as const : "rejoin" as const, ...result, titles
        };
    }
    async quit(uid: number, requestId?: string) {
        const result = await this.core.transaction.run(uid, async (tx) => {
            const current = await tx.statusIdentities.get(CLUB_IDENTITY_ID);
            if (!current)
                throw new BusinessError("NOT_ALLOWED", "你还没有加入椰汁俱乐部。");
            const status = statusFromState(current);
            if (!status.active)
                throw new BusinessError("NOT_ALLOWED", "你当前不是在会会员。");
            const hall = status.level === "hall", stats = { ...status.stats, duesEnabled: false };
            const state = await tx.statusIdentities.set(CLUB_IDENTITY_ID, {
                level: status.level, active: hall, parameters: stats
            });
            return { kind: hall ? "hall" as const : "quit" as const, status: statusFromState(state) };
        }, { source: "club.quit", idempotencyKey: requestId ? `club:quit:${requestId}` : undefined });
        this.logger.info("会员退出 uid=%s result=%s level=%s", uid, result.kind, result.status.level);
        return result;
    }
    async donate(uid: number, currency: "gold" | "ascension_score", amount: number, requestId?: string) {
        if (!Number.isSafeInteger(amount) || amount <= 0)
            throw new BusinessError("INVALID_INPUT", "贡献数值必须是正整数。");
        const result = await this.core.transaction.run(uid, async (tx) => {
            const current = await requireMembership(tx), status = statusFromState(current);
            if (!status.active)
                throw new BusinessError("NOT_ALLOWED", "只有在会会员可以主动贡献。");
            await tx.economy.pay({ [currency]: amount });
            const stats = { ...status.stats };
            if (currency === "gold")
                stats.goldContribution += amount;
            else
                stats.ascensionContribution += amount;
            const level = levelFor(stats);
            if (level === "hall")
                stats.hallUnlocked = true;
            await addToPool(tx, currency === "gold" ? poolCredit(amount, this.config.poolRate) : 0, currency === "ascension_score" ? poolCredit(amount, this.config.poolRate) : 0);
            const state = await tx.statusIdentities.set(CLUB_IDENTITY_ID, {
                level, active: true, parameters: stats
            });
            return statusFromState(state);
        }, { source: "club.donate", idempotencyKey: requestId ? `club:donate:${requestId}` : undefined });
        const titles = await this.awardTitles(uid, result.stats);
        this.logger.info("会员贡献 uid=%s currency=%s amount=%s level=%s", uid, currency, amount, result.level);
        return {
            status: result, titles, currency, amount
        };
    }
    async aid(uid: number, requestId?: string) {
        const date = this.core.gameDay.currentDate();
        const result = await this.core.transaction.run(uid, async (tx) => {
            const wallet = await tx.economy.getWallet();
            if (wallet.gold >= this.config.aidGoldThreshold || wallet.ascension_score >= this.config.aidAscensionThreshold)
                throw new BusinessError("NOT_ALLOWED", `仅金币低于 ${this.config.aidGoldThreshold} 且登神分低于 ${this.config.aidAscensionThreshold} 时可以领取救济。`);
            const data = await tx.data.get(), privateData = { ...data.private };
            if (privateData.lastAidDate === date)
                throw new BusinessError("LIMIT_REACHED", "你今天已经领取过椰汁俱乐部救济。");
            await takeFromPool(tx, this.config.aidGold, this.config.aidAscension);
            await tx.economy.creditFixed({ gold: this.config.aidGold, ascension_score: this.config.aidAscension });
            privateData.lastAidDate = date;
            await tx.data.set({ private: privateData });
            return { gold: this.config.aidGold, ascension: this.config.aidAscension };
        }, { source: "club.aid", idempotencyKey: requestId ? `club:aid:${requestId}` : undefined });
        this.logger.info("救济发放 uid=%s gold=%s ascension=%s", uid, result.gold, result.ascension);
        return result;
    }
    async adjustStats(uid: number, field: keyof Pick<ClubStats, "feeCount" | "goldContribution" | "ascensionContribution">, delta: number, requestId?: string) {
        if (!Number.isSafeInteger(delta) || delta === 0)
            throw new BusinessError("INVALID_INPUT", "变化值必须是非零整数。");
        const result = await this.core.transaction.run(uid, async (tx) => {
            const current = await requireMembership(tx), status = statusFromState(current), stats = { ...status.stats, [field]: status.stats[field] + delta };
            if (stats[field] < 0 || !Number.isSafeInteger(stats[field]))
                throw new BusinessError("INVALID_INPUT", "俱乐部累计数值不能小于 0。");
            const level = levelFor(stats);
            if (level === "hall")
                stats.hallUnlocked = true;
            const state = await tx.statusIdentities.set(CLUB_IDENTITY_ID, {
                level, active: status.active || level === "hall", parameters: stats
            });
            return statusFromState(state);
        }, { source: "club.admin-adjust", idempotencyKey: requestId ? `club:adjust:${requestId}:${uid}:${field}` : undefined });
        await this.awardTitles(uid, result.stats);
        this.logger.info("会员累计数值调整 uid=%s field=%s delta=%s value=%s", uid, field, delta, result.stats[field]);
        return result;
    }
    async adjustPool(actorUid: number, currency: "gold" | "ascension_score", delta: number, requestId?: string) {
        if (!Number.isSafeInteger(delta) || delta === 0)
            throw new BusinessError("INVALID_INPUT", "贡献池变化值必须是非零整数。");
        const result = await this.core.transaction.run(actorUid, async (tx) => {
            const pool = await readPool(tx), next = currency === "gold" ? { gold: pool.gold + delta, ascension: pool.ascension } : { gold: pool.gold, ascension: pool.ascension + delta };
            if (next.gold < 0 || next.ascension < 0)
                throw new BusinessError("INVALID_INPUT", "贡献池不能扣减为负数。");
            await writePool(tx, pool, next);
            return next;
        }, { source: "club.admin-pool", idempotencyKey: requestId ? `club:pool:${requestId}` : undefined });
        this.logger.info("贡献池调整 actor=%s currency=%s delta=%s gold=%s ascension=%s", actorUid, currency, delta, result.gold, result.ascension);
        return result;
    }
    async adjustPoolBoth(actorUid: number, delta: number, requestId?: string) {
        if (!Number.isSafeInteger(delta) || delta === 0)
            throw new BusinessError("INVALID_INPUT", "贡献池变化值必须是非零整数。");
        const result = await this.core.transaction.run(actorUid, async (tx) => {
            const pool = await readPool(tx), next = { gold: pool.gold + delta, ascension: pool.ascension + delta };
            if (next.gold < 0 || next.ascension < 0)
                throw new BusinessError("INVALID_INPUT", "贡献池不能扣减为负数。");
            await writePool(tx, pool, next);
            return next;
        }, { source: "club.admin-pool", idempotencyKey: requestId ? `club:pool-both:${requestId}` : undefined });
        this.logger.info("贡献池同步调整 actor=%s delta=%s gold=%s ascension=%s", actorUid, delta, result.gold, result.ascension);
        return result;
    }
    async renewAll(date: string) {
        let after = 0, renewed = 0, expired = 0, upgraded = 0;
        while (true) {
            const states = await this.core.statusIdentities.listByIdentity(CLUB_IDENTITY_ID, {
                active: true, afterUid: after, limit: 100
            });
            if (!states.length)
                break;
            for (const state of states) {
                const status = statusFromState(state);
                after = state.uid;
                if (!status.duesEnabled || status.stats.lastFeeDate === date)
                    continue;
                try {
                    const next = await this.renew(state.uid, date);
                    renewed++;
                    if (next.level !== status.level)
                        upgraded++;
                    await this.awardTitles(state.uid, next.stats);
                }
                catch (error) {
                    if ((error as {
                        code?: string;
                    }).code !== "INSUFFICIENT_BALANCE") {
                        this.logger.warn("会员续费失败 uid=%s %s", state.uid, error);
                        continue;
                    }
                    await this.deactivate(state.uid);
                    expired++;
                }
            }
            if (states.length < 100)
                break;
        }
        this.logger.info("每日续费完成 date=%s renewed=%s expired=%s upgraded=%s", date, renewed, expired, upgraded);
        return {
            renewed, expired, upgraded
        };
    }
    async distribute(actorUid: number, requestId: string) {
        let payouts = await this.core.table.get<ClubTableRow>({ kind: "payout", status: "pending" });
        if (!payouts.length) {
            const eligible = await this.eligibleMembers();
            if (!eligible.length)
                throw new BusinessError("NOT_FOUND", "当前没有具有分成权限的椰汁。");
            payouts = await this.prepareDistribution(actorUid, eligible, requestId);
        }
        let paid = 0, gold = 0, ascension = 0;
        for (const payout of payouts) {
            await this.core.transaction.run(payout.uid, async (tx) => {
                const [fresh] = await tx.table.get<ClubTableRow>({ key: payout.key });
                if (!fresh || fresh.status === "paid")
                    return;
                const amount = { ...(fresh.gold ? { gold: fresh.gold } : {}), ...(fresh.ascension_score ? { ascension_score: fresh.ascension_score } : {}) };
                if (Object.keys(amount).length)
                    await tx.economy.creditFixed(amount);
                await tx.table.set({ key: fresh.key, version: fresh.version }, {
                    status: "paid", version: fresh.version + 1, updated_at: new Date()
                });
            }, { source: "club.dividend", idempotencyKey: `club:payout:${payout.key}` });
            paid++;
            gold += payout.gold;
            ascension += payout.ascension_score;
        }
        this.logger.info("会员分成完成 actor=%s recipients=%s gold=%s ascension=%s", actorUid, paid, gold, ascension);
        return {
            paid, gold, ascension
        };
    }
    async reconcileTitles(uid: number) {
        const status = await this.status(uid);
        return status ? this.awardTitles(uid, status.stats) : [];
    }
    private async renew(uid: number, date: string) {
        return this.core.transaction.run(uid, async (tx) => {
            const current = await requireMembership(tx), status = statusFromState(current);
            if (!status.active || !status.duesEnabled || status.stats.lastFeeDate === date)
                return status;
            const cost = { gold: this.config.dailyGoldFee, ascension_score: this.config.dailyAscensionFee };
            if (cost.gold || cost.ascension_score)
                await tx.economy.pay(cost);
            const stats = advance(status.stats, cost.gold, cost.ascension_score, date), level = levelFor(stats);
            if (level === "hall")
                stats.hallUnlocked = true;
            await addToPool(tx, poolCredit(cost.gold, this.config.poolRate), poolCredit(cost.ascension_score, this.config.poolRate));
            return statusFromState(await tx.statusIdentities.set(CLUB_IDENTITY_ID, {
                level, active: true, parameters: stats
            }));
        }, { source: "club.daily-fee", idempotencyKey: `club:daily:${date}:${uid}` });
    }
    private async deactivate(uid: number) {
        await this.core.transaction.run(uid, async (tx) => {
            const current = await requireMembership(tx), status = statusFromState(current);
            if (!status.active && !status.duesEnabled)
                return;
            const hall = status.level === "hall", stats = { ...status.stats, duesEnabled: false };
            await tx.statusIdentities.set(CLUB_IDENTITY_ID, {
                level: status.level, active: hall, parameters: stats
            });
        }, { source: "club.expire" });
    }
    private async awardTitles(uid: number, stats: ClubStats) {
        const granted: string[] = [];
        for (const id of qualifyingTitles(stats)) {
            try {
                if (!await this.titles.grant(uid, id))
                    continue;
                const title = this.titles.get(id);
                if (title)
                    granted.push(title.name);
            }
            catch (error) {
                this.logger.warn("会员称号同步失败 uid=%s title=%s %s", uid, id, error);
            }
        }
        return granted;
    }
    private async eligibleMembers() {
        const result: Array<{
            uid: number;
            weight: number;
        }> = [];
        let after = 0;
        while (true) {
            const rows = await this.core.statusIdentities.listByIdentity(CLUB_IDENTITY_ID, { afterUid: after, limit: 500 });
            for (const row of rows) {
                after = row.uid;
                const status = statusFromState(row), factor = CLUB_LEVELS[status.level].shareFactor;
                if ((status.active || status.level === "hall") && factor > 0)
                    result.push({ uid: row.uid, weight: (status.stats.feeCount + Math.floor(status.stats.goldContribution / 3000) + Math.floor(status.stats.ascensionContribution / 700)) * factor });
            }
            if (rows.length < 500)
                break;
        }
        return result.filter((item) => item.weight > 0);
    }
    private async prepareDistribution(actorUid: number, members: Array<{
        uid: number;
        weight: number;
    }>, requestId: string) {
        return this.core.transaction.run(actorUid, async (tx) => {
            const pending = await tx.table.get<ClubTableRow>({ kind: "payout", status: "pending" });
            if (pending.length)
                return pending;
            const markerKey = `settlement:${requestId}`, [marker] = await tx.table.get<ClubTableRow>({ key: markerKey });
            if (marker)
                return [];
            const pool = await readPool(tx), consumed = { gold: Math.floor(pool.gold * 0.5), ascension: Math.floor(pool.ascension * 0.5) };
            const distributed = { gold: Math.floor(consumed.gold * 0.8), ascension: Math.floor(consumed.ascension * 0.8) };
            if (!distributed.gold && !distributed.ascension)
                throw new BusinessError("INSUFFICIENT_RESOURCE", "贡献池不足以进行分成。");
            const goldShares = allocate(distributed.gold, members), scoreShares = allocate(distributed.ascension, members), now = new Date();
            await writePool(tx, pool, { gold: pool.gold - consumed.gold, ascension: pool.ascension - consumed.ascension });
            await tx.table.create({
                ...emptyTableRow(markerKey, "settlement", now), gold: consumed.gold, ascension_score: consumed.ascension, status: "created"
            });
            const payouts: ClubTableRow[] = [];
            for (let i = 0; i < members.length; i++) {
                const row = {
                    ...emptyTableRow(`payout:${requestId}:${members[i].uid}`, "payout", now), uid: members[i].uid, gold: goldShares[i], ascension_score: scoreShares[i], weight: members[i].weight, status: "pending"
                } as ClubTableRow;
                await tx.table.create(row);
                payouts.push(row);
            }
            return payouts;
        }, { source: "club.dividend.prepare" });
    }
}
function emptyStats(now = new Date()): ClubStats {
    return {
        feeCount: 0, goldContribution: 0, ascensionContribution: 0, joinedAt: now.toISOString(), lastFeeDate: "", duesEnabled: true
    };
}
function readStats(value: Readonly<Record<string, unknown>>): ClubStats {
    const defaults = emptyStats();
    const stats: ClubStats = {
        feeCount: value.feeCount as number,
        goldContribution: value.goldContribution as number,
        ascensionContribution: value.ascensionContribution as number,
        joinedAt: typeof value.joinedAt === "string" && value.joinedAt.length <= 64 ? value.joinedAt : defaults.joinedAt,
        lastFeeDate: typeof value.lastFeeDate === "string" && value.lastFeeDate.length <= 32 ? value.lastFeeDate : "",
        duesEnabled: value.duesEnabled !== false,
        ...(value.hallUnlocked === true ? { hallUnlocked: true } : {}),
    };
    for (const key of ["feeCount", "goldContribution", "ascensionContribution"] as const) {
        if (!Number.isSafeInteger(stats[key]) || stats[key] < 0)
            throw new BusinessError("INTERNAL_ERROR", `俱乐部数据异常：${key}`);
    }
    return stats;
}
function advance(stats: ClubStats, gold: number, ascension: number, date: string) {
    return {
        ...stats, feeCount: stats.feeCount + 1, goldContribution: stats.goldContribution + gold, ascensionContribution: stats.ascensionContribution + ascension, lastFeeDate: date
    };
}
function statusFromState(state: Readonly<FaithStatusIdentityState>): ClubStatus {
    const level = state.level as ClubLevel;
    if (!(level in CLUB_LEVELS))
        throw new BusinessError("INTERNAL_ERROR", `未知椰汁等级：${state.level}`);
    const stats = Object.freeze(readStats(state.parameters));
    return Object.freeze({
        uid: state.uid, level, levelName: CLUB_LEVELS[level].name, active: state.active, duesEnabled: stats.duesEnabled, stats
    });
}
async function requireMembership(tx: FaithAtomicScope) {
    const state = await tx.statusIdentities.get(CLUB_IDENTITY_ID);
    if (!state)
        throw new BusinessError("NOT_ALLOWED", "你还没有加入椰汁俱乐部。");
    return state;
}
function poolRow(): ClubTableRow {
    return { ...emptyTableRow(POOL_KEY, "pool", new Date()), status: "active" };
}
function emptyTableRow(key: string, kind: ClubTableRow["kind"], now: Date): ClubTableRow {
    return {
        key, kind, uid: 0, gold: 0, ascension_score: 0, weight: 0, status: "", version: 0, created_at: now, updated_at: now
    };
}
async function readPool(tx: FaithAtomicScope) {
    const [row] = await tx.table.get<ClubTableRow>({ key: POOL_KEY });
    if (!row)
        throw new BusinessError("INTERNAL_ERROR", "贡献池尚未初始化。");
    return {
        row, gold: safeAmount(row.gold), ascension: safeAmount(row.ascension_score)
    };
}
async function writePool(tx: FaithAtomicScope, before: Awaited<ReturnType<typeof readPool>>, next: ClubPool) {
    const result = await tx.table.set({ key: POOL_KEY, version: before.row.version }, {
        gold: next.gold, ascension_score: next.ascension, version: before.row.version + 1, updated_at: new Date()
    });
    if (result.matched !== 1)
        throw new BusinessError("CONFLICT", "贡献池刚刚发生变化，请重试。");
}
async function addToPool(tx: FaithAtomicScope, gold: number, ascension: number) {
    const pool = await readPool(tx);
    await writePool(tx, pool, { gold: pool.gold + gold, ascension: pool.ascension + ascension });
}
async function takeFromPool(tx: FaithAtomicScope, gold: number, ascension: number) {
    const pool = await readPool(tx);
    if (pool.gold < gold || pool.ascension < ascension)
        throw new BusinessError("INSUFFICIENT_RESOURCE", "贡献池当前不足以提供救济。");
    await writePool(tx, pool, { gold: pool.gold - gold, ascension: pool.ascension - ascension });
}
function safeAmount(value: unknown) {
    const number = Number(value ?? 0);
    if (!Number.isSafeInteger(number) || number < 0)
        throw new BusinessError("INTERNAL_ERROR", "贡献池数值异常。");
    return number;
}
function poolCredit(amount: number, rate: number) {
    const result = Math.floor(amount * rate + Number.EPSILON * Math.max(1, amount));
    if (!Number.isSafeInteger(result) || result < 0)
        throw new BusinessError("INVALID_INPUT", "计入贡献池的数值超出安全范围。");
    return result;
}
function allocate(total: number, members: Array<{
    uid: number;
    weight: number;
}>) {
    const sum = members.reduce((value, item) => value + item.weight, 0), raw = members.map((item) => total * item.weight / sum), result = raw.map(Math.floor);
    let rest = total - result.reduce((a, b) => a + b, 0);
    const order = raw.map((value, index) => ({
        index, fraction: value - result[index], uid: members[index].uid
    })).sort((a, b) => b.fraction - a.fraction || a.uid - b.uid);
    for (let i = 0; i < rest; i++)
        result[order[i % order.length].index]++;
    return result;
}
