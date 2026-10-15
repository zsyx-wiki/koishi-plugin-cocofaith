import { type BonusContribution, type FaithAtomicScope, type FaithBusinessCoreScope, } from "cocofaith-sdk/core";
import { createHash } from "node:crypto";
import { BusinessError } from "../../framework/errors";
import type { RouletteGameplayApi } from "../roulette";
import type { TitleServiceApi } from "../title";
import type { ContainerConfig } from "./config";
import { CONTAINER_IDENTITY_ID, DIVINITY_FRAGMENT_ITEM_ID, FAITH_CONTAINER_ITEM_ID, } from "./data";
import { calculateDivinityGain, initialContainerState, normalizeContainerState, rollDailyDivinity } from "./state";
import type { ContainerAscensionResult, ContainerConsecrationResult, ContainerGrantResult, ContainerInfusionResult, ContainerLevel, ContainerState, ContainerStatus, ContainerTrueGodResult, } from "./types";
export class ContainerService {
    constructor(private core: FaithBusinessCoreScope, private titles: TitleServiceApi, private roulette: RouletteGameplayApi, private config: Readonly<ContainerConfig>, private random: () => number = Math.random) {
    }
    configure(config: Readonly<ContainerConfig>) {
        this.config = config;
    }
    async status(uid: number): Promise<ContainerStatus> {
        if (await this.core.items.getQuantity(uid, FAITH_CONTAINER_ITEM_ID) < 1)
            throw new BusinessError("NOT_ALLOWED", "你尚未拥有【神性容器】。");
        const identity = await this.core.statusIdentities.state(uid, CONTAINER_IDENTITY_ID);
        if (identity?.active)
            return Object.freeze({
                level: identity.level as ContainerLevel, state: normalizeContainerState(identity.parameters, this.config.maxConsecrationCharges), identity
            });
        return this.core.transaction.run(uid, (tx) => this.requireOwned(tx), { source: "container.initialize" });
    }
    async setPrayerWord(uid: number, word: string) {
        if (word.length !== 9 || !/^[\u4e00-\u9fff]{4}，[\u4e00-\u9fff]{4}$/.test(word))
            throw new BusinessError("INVALID_INPUT", "祷词格式必须是四个汉字、一个中文逗号、四个汉字，例如：椰风轻拂，神光降临。");
        const faith = await this.requireTrueGodFaith(uid);
        return this.core.faiths.setPrayerWord(faith, word, uid);
    }
    async setCustomProfession(uid: number, type: string, name: string) {
        if (!name || [...name].length > 5)
            throw new BusinessError("INVALID_INPUT", "职业名须为 1 至 5 个字符。");
        const faith = await this.requireTrueGodFaith(uid);
        return this.core.faiths.setCustomProfession(faith, type, name, uid);
    }
    private async requireTrueGodFaith(uid: number) {
        const identity = await this.core.statusIdentities.state(uid, CONTAINER_IDENTITY_ID);
        if (!identity?.active || identity.level !== "truegod")
            throw new BusinessError("NOT_ALLOWED", "你尚未登临真神之位。");
        const state = normalizeContainerState(identity.parameters, this.config.maxConsecrationCharges);
        if (!state.truegodName)
            throw new BusinessError("NOT_ALLOWED", "真神身份缺少所属信仰，请联系管理员。");
        return state.truegodName;
    }
    grant(uid: number, source = "external", idempotencyKey?: string): Promise<ContainerGrantResult> {
        return this.core.transaction.run(uid, async (tx) => {
            const owned = await tx.items.getQuantity(FAITH_CONTAINER_ITEM_ID);
            if (owned > 0) {
                await this.ensureIdentity(tx);
                await tx.items.give(DIVINITY_FRAGMENT_ITEM_ID);
                return Object.freeze({ kind: "fragment" as const });
            }
            await tx.items.give(FAITH_CONTAINER_ITEM_ID);
            await this.ensureIdentity(tx);
            return Object.freeze({ kind: "container" as const });
        }, { source: `container.grant.${safeSource(source)}`, idempotencyKey });
    }
    infuseFragment(uid: number, amount: number, idempotencyKey?: string): Promise<ContainerInfusionResult> {
        assertPositiveInteger(amount, "投入数量");
        return this.core.transaction.run(uid, async (tx) => {
            const current = await this.requireOwned(tx);
            this.assertCanInfuse(current.state);
            await tx.items.take(DIVINITY_FRAGMENT_ITEM_ID, amount);
            return this.applyInfusion(tx, current, amount, "fragment");
        }, { source: "container.infuse.fragment", idempotencyKey });
    }
    async infuseRouletteHonor(uid: number, amount: number, operationId?: string): Promise<ContainerInfusionResult> {
        assertPositiveInteger(amount, "投入数量");
        // 先做只读校验，减少需要补偿的概率。荣誉属于 roulette 私有战绩，必须通过其公开接口修改。
        this.assertCanInfuse((await this.status(uid)).state);
        const debitKey = operationId ? `container:roulette:debit:${operationId}` : undefined;
        await this.roulette.changeHonor(uid, -amount, debitKey);
        try {
            return await this.core.transaction.run(uid, async (tx) => {
                const current = await this.requireOwned(tx);
                this.assertCanInfuse(current.state);
                return this.applyInfusion(tx, current, amount, "roulette");
            }, { source: "container.infuse.roulette", idempotencyKey: operationId ? `container:roulette:credit:${operationId}` : undefined });
        }
        catch (error) {
            try {
                await this.roulette.changeHonor(uid, amount, operationId ? `container:roulette:refund:${operationId}` : undefined);
            }
            catch (refundError) {
                throw new AggregateError([error, refundError], "轮盘荣誉投入失败，且自动退还荣誉失败", { cause: error });
            }
            throw error;
        }
    }
    consecrate(uid: number, count = 1, idempotencyKey?: string): Promise<ContainerConsecrationResult> {
        assertPositiveInteger(count, "觐献次数");
        return this.core.transaction.run(uid, async (tx) => {
            const current = await this.requireOwned(tx), state = current.state;
            if (state.consecrationCharges < count)
                throw new BusinessError("INSUFFICIENT_RESOURCE", `觐献次数不足：需要 ${count}，当前 ${state.consecrationCharges}。`);
            const spent = safeMultiply(count, this.config.consecrationDivinityCost);
            if (state.divinity < spent)
                throw new BusinessError("INSUFFICIENT_RESOURCE", `神性不足：需要 ${spent} 滴。`);
            const reward = safeMultiply(count, this.config.consecrationAudienceReward);
            state.divinity -= spent;
            state.consecrationCharges -= count;
            if (reward)
                await tx.users.change({ audience_score: reward });
            await this.save(tx, current.level, state);
            return Object.freeze({
                count, spent, reward, divinity: state.divinity, charges: state.consecrationCharges
            });
        }, { source: "container.consecrate", idempotencyKey });
    }
    async ascendSubgod(uid: number, godName: string, idempotencyKey?: string): Promise<ContainerAscensionResult> {
        const name = godName.trim();
        if (name.length < 2 || name.length > 5)
            throw new BusinessError("INVALID_INPUT", "神名长度必须是 2-5 个字符。");
        if (this.titles.resolve(name) || this.core.faiths.has(name))
            throw new BusinessError("CONFLICT", `神名【${name}】已被占用。`);
        const titleId = customTitleId("subgod", name);
        this.titles.register({
            id: titleId, name, description: `由信仰容器凝聚的从神神格。`, source: `UID ${uid} 通过神性容器登神。`, hidden: true, custom: true
        });
        let faith = "";
        try {
            await this.core.transaction.run(uid, async (tx) => {
                const current = await this.requireOwned(tx);
                if (current.level !== "mortal")
                    throw new BusinessError("CONFLICT", "你已经凝聚神格，不可重复登神。");
                if (current.state.divinity < this.config.subgodDivinityCost)
                    throw new BusinessError("INSUFFICIENT_RESOURCE", `登神需要 ${this.config.subgodDivinityCost} 滴神性。`);
                const user = await tx.users.get();
                faith = user.faiths[0] ?? "";
                if (!faith)
                    throw new BusinessError("NOT_ALLOWED", "你尚未拥有信仰。");
                current.state.divinity -= this.config.subgodDivinityCost;
                current.state.subgodName = name;
                current.state.originalFaith = faith;
                await tx.economy.creditFixed({ gold: this.config.subgodGoldReward, ascension_score: this.config.subgodAscensionReward });
                if (this.config.subgodAudienceReward)
                    await tx.users.change({ audience_score: this.config.subgodAudienceReward });
                await this.save(tx, "subgod", current.state);
            }, { source: "container.ascend_subgod", idempotencyKey });
        }
        catch (error) {
            await this.titles.unregister(titleId).catch(() => undefined);
            throw error;
        }
        await this.titles.grant(uid, titleId);
        return Object.freeze({
            godName: name, faith, titleId
        });
    }
    trueGodCost(path: string) {
        const count = this.core.faiths.byPath(path).filter((faith) => faith.type === "dynamic" && faith.metadata?.source === "divinity_container").length;
        return Object.freeze({
            gold: safeAdd(this.config.truegodBaseGoldCost, safeMultiply(this.config.truegodGoldIncrement, count)),
            ascension_score: safeAdd(this.config.truegodBaseAscensionCost, safeMultiply(this.config.truegodAscensionIncrement, count)),
        });
    }
    async ascendTrueGod(uid: number, godName: string, path: string, spItemName: string, idempotencyKey?: string): Promise<ContainerTrueGodResult> {
        const name = godName.trim(), selectedPath = path.trim(), itemKey = spItemName.trim();
        if (!/^[\u4e00-\u9fff]{2}$/.test(name))
            throw new BusinessError("INVALID_INPUT", "真神名号必须是两个纯中文字符。");
        if (!this.core.faiths.paths().includes(selectedPath))
            throw new BusinessError("INVALID_INPUT", "所选命途不存在。");
        if (this.core.faiths.has(name) || this.titles.resolve(name))
            throw new BusinessError("CONFLICT", `名号【${name}】已被占用。`);
        const item = this.core.items.resolve(itemKey);
        if (!item || item.level !== "SP" || item.type !== "道具" || !item.marketable)
            throw new BusinessError("INVALID_INPUT", "祭品必须是可出售的常规 SP 级道具。");
        const cost = this.trueGodCost(selectedPath), titleId = customTitleId("truegod", name);
        this.titles.register({
            id: titleId, name, description: `君临【${selectedPath}】命途的至高真神。`, source: `UID ${uid} 通过神性容器点燃神火。`, hidden: true, custom: true
        });
        let faithCreated = false;
        try {
            await this.core.faiths.registerDynamic({
                name, path: selectedPath, creatorUid: uid, metadata: { source: "divinity_container" }
            });
            faithCreated = true;
            await this.core.transaction.run(uid, async (tx) => {
                const current = await this.requireOwned(tx);
                if (current.level === "truegod")
                    throw new BusinessError("CONFLICT", "你已经是真神。");
                if (current.level !== "subgod")
                    throw new BusinessError("NOT_ALLOWED", "只有从神才能问鼎真神之位。");
                if (current.state.divinity < this.config.truegodDivinityCost)
                    throw new BusinessError("INSUFFICIENT_RESOURCE", `晋升真神需要 ${this.config.truegodDivinityCost} 滴神性。`);
                if (await tx.items.getQuantity(item.item_id) < 1)
                    throw new BusinessError("INSUFFICIENT_RESOURCE", `背包中没有【${item.name}】。`);
                if (!await tx.economy.canAfford(cost))
                    throw new BusinessError("INSUFFICIENT_RESOURCE", `晋升需要 ${cost.gold} 金币和 ${cost.ascension_score} 登神分。`);
                current.state.divinity -= this.config.truegodDivinityCost;
                current.state.truegodName = name;
                current.state.path = selectedPath;
                await tx.economy.pay(cost);
                await tx.items.take(item.item_id);
                const user = await tx.users.get();
                await tx.users.setFaiths([name, ...user.faiths.slice(1).filter((faith) => faith !== name)]);
                await this.save(tx, "truegod", current.state);
            }, { source: "container.ascend_truegod", idempotencyKey });
        }
        catch (error) {
            const cleanup: unknown[] = [];
            if (faithCreated)
                try {
                    await this.core.faiths.unregisterDynamic(name, uid);
                }
                catch (cause) {
                    cleanup.push(cause);
                }
            try {
                await this.titles.unregister(titleId);
            }
            catch (cause) {
                cleanup.push(cause);
            }
            if (cleanup.length)
                throw new AggregateError([error, ...cleanup], "真神晋升失败，且创建补偿未完全完成", { cause: error });
            throw error;
        }
        await this.titles.grant(uid, titleId);
        return Object.freeze({
            godName: name, faith: name, path: selectedPath, titleId, cost
        });
    }
    async revokeSubgod(uid: number, idempotencyKey?: string) {
        let godName = "";
        const changed = await this.core.transaction.run(uid, async (tx) => {
            const current = await this.requireOwned(tx);
            if (current.level !== "subgod")
                return false;
            godName = current.state.subgodName ?? "";
            const rewards = {
                gold: -this.config.subgodGoldReward,
                ascension_score: -this.config.subgodAscensionReward,
                audience_score: -this.config.subgodAudienceReward,
            };
            await tx.users.change(rewards);
            current.state.divinity = 0;
            delete current.state.subgodName;
            delete current.state.originalFaith;
            await this.save(tx, "mortal", current.state);
            return true;
        }, { source: "container.admin.revoke_subgod", idempotencyKey });
        if (changed && godName) {
            await this.titles.revoke(uid, godName);
            await this.titles.unregister(godName).catch(() => undefined);
        }
        return changed;
    }
    adjustDivinity(uid: number, delta: number, idempotencyKey?: string) {
        if (!Number.isFinite(delta) || delta === 0)
            throw new BusinessError("INVALID_INPUT", "神性变化必须是非零有限数字。");
        return this.core.transaction.run(uid, async (tx) => {
            const current = await this.requireOwned(tx);
            current.state.divinity = Math.max(0, current.state.divinity + delta);
            await this.save(tx, current.level, current.state);
            return current.state.divinity;
        }, { source: "container.admin.divinity", idempotencyKey });
    }
    adjustCharges(uid: number, delta: number, idempotencyKey?: string) {
        if (!Number.isSafeInteger(delta) || delta === 0)
            throw new BusinessError("INVALID_INPUT", "觐献次数变化必须是非零安全整数。");
        return this.core.transaction.run(uid, async (tx) => {
            const current = await this.requireOwned(tx);
            current.state.consecrationCharges = Math.max(0, current.state.consecrationCharges + delta);
            await this.save(tx, current.level, current.state);
            return current.state.consecrationCharges;
        }, { source: "container.admin.charges", idempotencyKey });
    }
    async renewAll(date: string) {
        let afterUid = 0;
        const failures: unknown[] = [];
        while (true) {
            const page = await this.core.statusIdentities.listByIdentity(CONTAINER_IDENTITY_ID, {
                active: true, afterUid, limit: 100
            });
            if (!page.length)
                break;
            const settled = await Promise.allSettled(page.map((identity) => this.renew(identity.uid, date)));
            for (const result of settled)
                if (result.status === "rejected")
                    failures.push(result.reason);
            afterUid = page.at(-1)!.uid;
            if (page.length < 100)
                break;
        }
        if (failures.length)
            throw new AggregateError(failures, `${failures.length} 个神性容器每日结算失败`);
    }
    /** 重启后恢复动态称号，并清理由晋升中断留下的零信徒动态信仰。 */
    async restorePersistentDefinitions() {
        for (const faith of this.core.faiths.all()) {
            if (faith.type !== "dynamic" || faith.metadata?.source !== "divinity_container" || faith.creator_uid === undefined)
                continue;
            const identity = await this.core.statusIdentities.state(faith.creator_uid, CONTAINER_IDENTITY_ID);
            const state = identity ? normalizeContainerState(identity.parameters, this.config.maxConsecrationCharges) : undefined;
            if ((!identity?.active || identity.level !== "truegod" || state?.truegodName !== faith.name) && faith.believer_count === 0) {
                await this.core.faiths.unregisterDynamic(faith.name, faith.creator_uid);
            }
        }
        let afterUid = 0;
        while (true) {
            const page = await this.core.statusIdentities.listByIdentity(CONTAINER_IDENTITY_ID, {
                active: true, afterUid, limit: 100
            });
            if (!page.length)
                break;
            for (const identity of page) {
                const state = normalizeContainerState(identity.parameters, this.config.maxConsecrationCharges);
                if ((identity.level === "subgod" || identity.level === "truegod") && state.subgodName) {
                    await this.restoreTitle(identity.uid, "subgod", state.subgodName, state.originalFaith ? `【${state.originalFaith}】从神` : "从神");
                }
                if (identity.level === "truegod" && state.truegodName) {
                    await this.restoreTitle(identity.uid, "truegod", state.truegodName, state.path ? `【${state.path}】命途真神` : "真神");
                }
            }
            afterUid = page.at(-1)!.uid;
            if (page.length < 100)
                break;
        }
    }
    bonusContributions(uid: number, type: string): Promise<BonusContribution[]> {
        return this.core.statusIdentities.state(uid, CONTAINER_IDENTITY_ID).then((identity) => {
            if (!identity?.active)
                return [];
            const state = normalizeContainerState(identity.parameters, this.config.maxConsecrationCharges);
            const result: BonusContribution[] = [];
            const effective = Math.floor(Math.min(state.divinity, this.config.passiveMaxDivinity));
            if (effective > 0 && (type === "gold" || type === "ascension_score"))
                result.push({
                    source: `神性容器（${effective}/${this.config.passiveMaxDivinity}）`, type,
                    modifier: effective * (type === "gold" ? this.config.goldPerDivinity : this.config.ascensionPerDivinity),
                });
            if (identity.level === "subgod" || identity.level === "truegod") {
                if (type === "gold")
                    result.push({
                        source: "从神身份", type, modifier: this.config.subgodGoldBonus
                    });
                if (type === "ascension_score")
                    result.push({
                        source: "从神身份", type, modifier: this.config.subgodAscensionBonus
                    });
                if (type === "void_prayer.daily_limit")
                    result.push({
                        source: "从神身份", type, fixedBonus: this.config.subgodVoidPrayerBonus
                    });
                if (type === "daily_prayer.daily_limit")
                    result.push({
                        source: "从神身份", type, fixedBonus: this.config.subgodDailyPrayerBonus
                    });
            }
            if (identity.level === "truegod") {
                if (type === "gold")
                    result.push({
                        source: "真神身份", type, modifier: this.config.truegodGoldBonus
                    });
                if (type === "ascension_score")
                    result.push({
                        source: "真神身份", type, modifier: this.config.truegodAscensionBonus
                    });
                if (type === "void_prayer.daily_limit")
                    result.push({
                        source: "真神身份", type, fixedBonus: this.config.truegodVoidPrayerBonus
                    });
            }
            return result;
        });
    }
    private async renew(uid: number, date: string) {
        return this.core.transaction.run(uid, async (tx) => {
            const identity = await tx.statusIdentities.get(CONTAINER_IDENTITY_ID);
            if (!identity?.active)
                return;
            const state = normalizeContainerState(identity.parameters, this.config.maxConsecrationCharges);
            if (state.lastChargeRecoveryDate !== date) {
                state.consecrationCharges = Math.min(this.config.maxConsecrationCharges, state.consecrationCharges + this.config.dailyChargeRecovery);
                state.lastChargeRecoveryDate = date;
            }
            if (state.lastDripDate !== date) {
                if (state.divinity < this.config.maxCapacity)
                    state.divinity = Math.min(this.config.maxCapacity, state.divinity + rollDailyDivinity(this.random));
                state.lastDripDate = date;
            }
            await this.save(tx, identity.level as ContainerLevel, state);
        }, { source: "container.daily", idempotencyKey: `container:daily:${date}:${uid}` });
    }
    private async restoreTitle(uid: number, kind: "subgod" | "truegod", name: string, description: string) {
        const expectedId = customTitleId(kind, name);
        const title = this.titles.resolve(name) ?? this.titles.register({
            id: expectedId,
            name,
            description,
            source: `UID ${uid} 通过神性容器获得。`,
            hidden: true,
            custom: true,
        });
        await this.titles.grant(uid, title.id);
    }
    private async requireOwned(tx: FaithAtomicScope): Promise<ContainerStatus> {
        if (await tx.items.getQuantity(FAITH_CONTAINER_ITEM_ID) < 1)
            throw new BusinessError("NOT_ALLOWED", "你尚未拥有【神性容器】。");
        const identity = await this.ensureIdentity(tx);
        return Object.freeze({
            level: identity.level as ContainerLevel, state: normalizeContainerState(identity.parameters, this.config.maxConsecrationCharges), identity
        });
    }
    private async ensureIdentity(tx: FaithAtomicScope) {
        const existing = await tx.statusIdentities.get(CONTAINER_IDENTITY_ID);
        if (existing?.active)
            return existing;
        return tx.statusIdentities.set(CONTAINER_IDENTITY_ID, {
            level: "mortal", active: true, parameters: initialContainerState()
        });
    }
    private save(tx: FaithAtomicScope, level: ContainerLevel, state: ContainerState) {
        return tx.statusIdentities.set(CONTAINER_IDENTITY_ID, {
            level, active: true, parameters: state
        });
    }
    private assertCanInfuse(state: ContainerState) {
        if (state.divinity >= this.config.maxCapacity)
            throw new BusinessError("LIMIT_REACHED", "神性容器已经满溢。");
        if (state.divinity >= this.config.manualInfusionMax)
            throw new BusinessError("LIMIT_REACHED", `神性达到 ${this.config.manualInfusionMax} 后只能等待每日滴落。`);
    }
    private async applyInfusion(tx: FaithAtomicScope, current: ContainerStatus, amount: number, type: "fragment" | "roulette") {
        const gained = calculateDivinityGain(type, amount, current.state.divinity);
        const actual = Math.min(gained, this.config.manualInfusionMax - current.state.divinity);
        current.state.divinity += actual;
        await this.save(tx, current.level, current.state);
        return Object.freeze({ gained: actual, divinity: current.state.divinity });
    }
}
function customTitleId(kind: string, name: string) {
    return `${kind}-${createHash("sha256").update(name).digest("hex").slice(0, 20)}`;
}
function safeSource(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 48) || "external";
}
function assertPositiveInteger(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new BusinessError("INVALID_INPUT", `${label}必须是正整数。`);
}
function safeMultiply(left: number, right: number) {
    const value = left * right;
    if (!Number.isSafeInteger(value))
        throw new BusinessError("INVALID_INPUT", "计算结果超过安全范围。");
    return value;
}
function safeAdd(left: number, right: number) {
    const value = left + right;
    if (!Number.isSafeInteger(value))
        throw new BusinessError("INVALID_INPUT", "计算结果超过安全范围。");
    return value;
}
