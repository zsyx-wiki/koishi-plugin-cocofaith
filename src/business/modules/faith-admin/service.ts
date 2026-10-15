import { isFaithCoreError, type FaithBusinessCoreScope, type UserValueDelta } from "cocofaith-sdk/core";
import { Logger } from "koishi";
import { BusinessError } from "../../framework/errors";
import { MESSAGES } from "../../shared/messages";
import { FaithAdminCommandRegistry } from "./commands";
import { FaithAdminFieldRegistry, type FaithAdminNumericField } from "./fields";
const CORE_FIELDS: Readonly<Record<string, keyof UserValueDelta>> = Object.freeze({
    金币: "gold", 登神分数: "ascension_score", 觐见分数: "audience_score", 觐神分数: "audience_score", 弃誓次数: "abandon_count",
});
export class FaithAdminService {
    readonly fields = new FaithAdminFieldRegistry();
    readonly commands = new FaithAdminCommandRegistry();
    constructor(private core: FaithBusinessCoreScope) {
    }
    async isCreator(uid: number) {
        return this.core.permissions.check(uid, "faith.creator");
    }
    async changeAll(actorUid: number, fieldName: string, deltaValue: string, operationId: string, authorized = false) {
        if (!authorized && !(await this.isCreator(actorUid)))
            throw new BusinessError("NOT_ALLOWED", "此操作仅限创造者使用。");
        const field = CORE_FIELDS[fieldName], custom = this.fields.get(fieldName), delta = Number(deltaValue);
        if (!field && !custom)
            throw new BusinessError("INVALID_INPUT", `未知数值名。可选：${this.fieldNames().join("、")}`);
        if (!Number.isFinite(delta) || delta === 0)
            throw new BusinessError("INVALID_INPUT", "全体数值变化必须是非零有限数字。");
        if (field && ["gold", "ascension_score", "abandon_count"].includes(field) && !Number.isSafeInteger(delta))
            throw new BusinessError("INVALID_INPUT", "货币及弃誓次数变化必须是安全整数。");
        const result = field
            ? await this.core.bulk.changeValuesForAll({ [field]: delta }, { operationId, status: "active" })
            : await this.changeCustomForAll(actorUid, custom!, delta, operationId);
        const logger = new Logger("cocofaith-business-admin");
        logger.info(`全体数值调整 actor=${actorUid} field=${field ?? custom?.name} delta=${delta} operation=${result.operationId} total=${result.total} succeeded=${result.succeeded} skipped=${result.skipped} failed=${result.failed.length}`);
        for (const failure of result.failed)
            logger.warn(`全体数值调整失败 operation=${result.operationId} uid=${failure.uid} code=${failure.code} message=${failure.message}`);
        return { type: "text" as const, content: MESSAGES.admin.changedAll(fieldName, delta, result.succeeded, result.skipped, result.failed.length) };
    }
    async change(actorUid: number, fieldName: string, targetType: string, target: string, deltaValue: string, authorized = false) {
        if (!authorized && !(await this.isCreator(actorUid)))
            throw new BusinessError("NOT_ALLOWED", "此操作仅限创造者使用。");
        const targetUid = await this.resolveTarget(targetType, target), delta = Number(deltaValue);
        if (!Number.isFinite(delta) || delta === 0)
            throw new BusinessError("INVALID_INPUT", "数值变化必须是非零有限数字。");
        const coreField = CORE_FIELDS[fieldName], custom = this.fields.get(fieldName);
        if (!coreField && !custom)
            throw new BusinessError("INVALID_INPUT", `未知数值名。可选：${[...new Set([...Object.keys(CORE_FIELDS), ...this.fields.list().map((item) => item.name)])].join("、")}`);
        if (coreField) {
            if (coreField === "abandon_count" && !Number.isSafeInteger(delta))
                throw new BusinessError("INVALID_INPUT", "弃誓次数只能按整数调整。");
            await this.core.transaction.run(targetUid, async (tx) => {
                if (coreField === "gold" || coreField === "ascension_score") {
                    if (!Number.isSafeInteger(delta))
                        throw new BusinessError("INVALID_INPUT", "货币只能按安全整数调整。");
                    await tx.users.change({ [coreField]: delta });
                    return;
                }
                await tx.users.change({ [coreField]: delta });
            }, {
                source: "faith_admin.change_value", operatorUid: actorUid,
            });
            return { targetUid, delta };
        }
        const message = await custom!.change({
            actorUid, targetUid, delta
        });
        return {
            targetUid, delta, message
        };
    }
    private fieldNames() {
        return [...new Set([...Object.keys(CORE_FIELDS), ...this.fields.list().map((item) => item.name)])];
    }
    private async changeCustomForAll(actorUid: number, field: Readonly<FaithAdminNumericField>, delta: number, operationId: string) {
        let cursor = 0, total = 0, succeeded = 0, skipped = 0;
        const failed: Array<{
            uid: number;
            code: string;
            message: string;
        }> = [];
        while (true) {
            const uids = await this.core.users.listUids(cursor, 100);
            if (!uids.length)
                break;
            let index = 0;
            const worker = async () => {
                while (true) {
                    const uid = uids[index++];
                    if (uid === undefined)
                        return;
                    total++;
                    try {
                        await field.change({
                            actorUid, targetUid: uid, delta, operationId: `${operationId}:${uid}`
                        });
                        succeeded++;
                    }
                    catch (error) {
                        if (isFaithCoreError(error) && error.code === "IDEMPOTENCY_CONFLICT") {
                            skipped++;
                            continue;
                        }
                        failed.push({
                            uid, code: isFaithCoreError(error) ? error.code : "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(4, uids.length) }, worker));
            cursor = uids[uids.length - 1];
        }
        return {
            operationId, total, succeeded, skipped, failed
        };
    }
    private async resolveTarget(type: string, value: string) {
        if (type === "uid") {
            const uid = Number(value);
            if (!Number.isSafeInteger(uid))
                throw new BusinessError("INVALID_INPUT", "UID 格式无效。");
            await this.core.users.require(uid);
            return uid;
        }
        if (type === "qq") {
            const uid = await this.core.identities.resolve({
                adapter: "onebot", type: "qq_account", value, scope: "global"
            });
            if (uid === null)
                throw new BusinessError("NOT_FOUND", `QQ ${value} 尚未绑定 UID。`);
            return uid;
        }
        throw new BusinessError("INVALID_INPUT", "目标类型只能是 qq 或 uid。");
    }
}
