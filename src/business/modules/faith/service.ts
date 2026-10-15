import type { FaithBusinessCoreScope, FaithCoreUserData, FaithProfessionDefinition, IdentityInput } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import { MESSAGES } from "../../shared/messages";
import type { FaithGameplayConfig } from "./config";
export type { FaithGameplayConfig } from "./config";
export class FaithGameplayService {
    constructor(private core: FaithBusinessCoreScope, private config: Readonly<FaithGameplayConfig>) {
    }
    async info(uid: number) {
        return this.requireRegistered(uid);
    }
    async register(identity: Readonly<IdentityInput>, faithName: string) {
        const faith = this.requireFaith(faithName);
        try {
            return await this.core.faiths.registerUser(identity, faith.name);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes("已经注册信仰"))
                throw new BusinessError("CONFLICT", error.message);
            throw error;
        }
    }
    getAbandonCost(abandonCount: number) {
        if (!Number.isSafeInteger(abandonCount) || abandonCount < 0)
            throw new BusinessError("INVALID_INPUT", "弃誓次数无效。");
        return {
            ascensionCost: Math.min(this.config.abandonMaxAscensionCost, this.config.abandonBaseAscensionCost + abandonCount * this.config.abandonAscensionCostPerUse),
            audienceCost: abandonCount,
        };
    }
    async abandon(uid: number, targetFaith: string) {
        const target = this.requireFaith(targetFaith);
        return this.core.transaction.run(uid, async (tx) => {
            const user = await tx.users.get(), oldFaith = user.faiths[0];
            if (!oldFaith)
                throw new BusinessError("NOT_ALLOWED", "你尚未注册信仰，请使用“信仰 注册 [信仰名]”。");
            if (oldFaith === target.name)
                throw new BusinessError("CONFLICT", `你当前的信仰已是【${target.name}】。`);
            const cost = this.getAbandonCost(user.abandon_count);
            if (user.ascension_score < cost.ascensionCost || user.audience_score < cost.audienceCost) {
                throw new BusinessError("INSUFFICIENT_RESOURCE", `本次弃誓需要 ${cost.ascensionCost} 登神分和 ${cost.audienceCost} 觐见分。`, cost);
            }
            if (cost.ascensionCost)
                await tx.economy.pay({ ascension_score: cost.ascensionCost });
            if (cost.audienceCost)
                await tx.users.change({ audience_score: -cost.audienceCost });
            const after = await tx.users.abandonFaith(target.name);
            return {
                oldFaith, newFaith: target.name, cost, user: after
            };
        }, { source: "faith.abandon" });
    }
    async chooseProfession(uid: number, name: string) {
        return this.core.transaction.run(uid, async (tx) => {
            const user = await tx.users.get(), faith = user.faiths[0];
            if (!faith)
                throw new BusinessError("NOT_ALLOWED", "你尚未注册信仰，请使用“信仰 注册 [信仰名]”。");
            if (user.profession_id)
                throw new BusinessError("CONFLICT", `你已经拥有职业【${this.core.professions.get(user.profession_id)?.name ?? user.profession_id}】。`);
            const profession = this.requireProfession(name, faith);
            await tx.users.setProfession(profession.id);
            return profession;
        }, { source: "faith.choose_profession" });
    }
    async changeProfession(uid: number, name: string) {
        const goldCost = this.config.changeProfessionGoldCost, scoreCost = this.config.changeProfessionAscensionCost;
        return this.core.transaction.run(uid, async (tx) => {
            const user = await tx.users.get(), faith = user.faiths[0];
            if (!faith)
                throw new BusinessError("NOT_ALLOWED", "你尚未注册信仰，请使用“信仰 注册 [信仰名]”。");
            if (!user.profession_id)
                throw new BusinessError("CONFLICT", "你还没有职业，请先使用“信仰 职业 [职业名]”。");
            const profession = this.requireProfession(name, faith);
            if (user.profession_id === profession.id)
                throw new BusinessError("CONFLICT", `你当前的职业已是【${profession.name}】。`);
            if (user.gold < goldCost || user.ascension_score < scoreCost)
                throw new BusinessError("INSUFFICIENT_RESOURCE", `更换职业需要 ${goldCost} 金币和 ${scoreCost} 登神分。`);
            const old = this.core.professions.get(user.profession_id);
            if (goldCost || scoreCost)
                await tx.economy.pay({ gold: goldCost, ascension_score: scoreCost });
            await tx.users.setProfession(profession.id);
            return {
                old, profession, cost: { gold: goldCost, ascension: scoreCost }
            };
        }, { source: "faith.change_profession" });
    }
    professions(faith: string) {
        return this.core.professions.list({ faith: this.requireFaith(faith).name });
    }
    private async requireRegistered(uid: number) {
        const user = await this.core.users.require(uid);
        if (!user.faiths[0])
            throw new BusinessError("NOT_ALLOWED", "你尚未注册信仰，请使用“信仰 注册 [信仰名]”。");
        return user;
    }
    private requireFaith(name: string) {
        const value = name.trim();
        if (!value)
            throw new BusinessError("INVALID_INPUT", "请提供信仰名称。");
        const faith = this.core.faiths.get(value);
        if (!faith)
            throw new BusinessError("NOT_FOUND", `【${value}】不是有效信仰。可选：${this.core.faiths.all().map((item) => item.name).join("、")}`);
        return faith;
    }
    private requireProfession(name: string, faith: string): Readonly<FaithProfessionDefinition> {
        const value = name.trim();
        if (!value)
            throw new BusinessError("INVALID_INPUT", "请提供职业名称。");
        const profession = this.core.professions.resolve(value);
        if (profession?.faith === faith)
            return profession;
        const sameType = this.core.professions.list({ faith, type: value });
        if (sameType.length)
            throw new BusinessError("INVALID_INPUT", `【${value}】是职业类型，请选择具体职业：${sameType.map((item) => item.name).join("、")}`);
        if (profession)
            throw new BusinessError("NOT_ALLOWED", `职业【${profession.name}】属于【${profession.faith}】，与你当前信仰【${faith}】不符。`);
        throw new BusinessError("NOT_FOUND", `不存在名为【${value}】的职业。`);
    }
}
export function formatFaithInfo(user: FaithCoreUserData, profession?: Readonly<FaithProfessionDefinition>) {
    return MESSAGES.faith.info(user, profession);
}
