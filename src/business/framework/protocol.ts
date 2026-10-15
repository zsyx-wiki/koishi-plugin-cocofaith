import type { FaithCoreService, IdentityInput } from "cocofaith-sdk/core";
import { assertGameplayResult, GAMEPLAY_PROTOCOL_LIMITS } from "cocofaith-sdk/gameplay";
import { BusinessError } from "./errors";
import type { BusinessEvent, BusinessResult } from "./types";
export const BUSINESS_PROTOCOL_LIMITS = GAMEPLAY_PROTOCOL_LIMITS;
export function normalizeBusinessEvent(core: FaithCoreService, event: BusinessEvent): Readonly<BusinessEvent> {
    if (!event || typeof event !== "object")
        throw new BusinessError("INVALID_INPUT", "BusinessEvent 必须是对象。");
    if (event.uid !== null && (!Number.isSafeInteger(event.uid) || event.uid <= 0)) {
        throw new BusinessError("INVALID_INPUT", "BusinessEvent.uid 必须是正安全整数或 null。");
    }
    if (event.scene !== "group" && event.scene !== "private")
        throw new BusinessError("INVALID_INPUT", "BusinessEvent.scene 无效。");
    if (typeof event.content !== "string")
        throw new BusinessError("INVALID_INPUT", "BusinessEvent.content 必须是字符串。");
    if (event.content.length > BUSINESS_PROTOCOL_LIMITS.inputLength)
        throw new BusinessError("INVALID_INPUT", "消息内容过长。");
    if (event.channelId !== undefined && (typeof event.channelId !== "string" || event.channelId.length > 255)) {
        throw new BusinessError("INVALID_INPUT", "BusinessEvent.channelId 无效。");
    }
    let adapter;
    if (event.adapter !== undefined) {
        const { name, version, allowRegistration } = event.adapter;
        if (typeof name !== "string" || !name.trim() || name.length > 128 || typeof version !== "string" || !version.trim() || version.length > 64) {
            throw new BusinessError("INVALID_INPUT", "BusinessEvent.adapter 无效。");
        }
        if (allowRegistration !== undefined && typeof allowRegistration !== "boolean")
            throw new BusinessError("INVALID_INPUT", "BusinessEvent.adapter.allowRegistration 无效。");
        adapter = Object.freeze({
            name: name.trim(), version: version.trim(), allowRegistration: allowRegistration === true
        });
    }
    let identity: Readonly<IdentityInput> | undefined;
    if (event.identity !== undefined)
        identity = Object.freeze(core.adapter.normalize(event.identity));
    if (event.uid === null && !identity)
        throw new BusinessError("INVALID_INPUT", "未注册事件必须包含标准身份。");
    for (const key of ["roomKey", "eventId", "displayName"] as const) {
        if (event[key] !== undefined && (typeof event[key] !== "string" || event[key]!.length > 512))
            throw new BusinessError("INVALID_INPUT", `BusinessEvent.${key} 无效。`);
    }
    if (event.reply !== undefined && typeof event.reply !== "function")
        throw new BusinessError("INVALID_INPUT", "回复通道无效");
    const reply = event.reply ? async (result: BusinessResult) => {
        assertBusinessResult(result);
        return event.reply!(result);
    } : undefined;
    return Object.freeze({
        uid: event.uid, identity, scene: event.scene, content: event.content, channelId: event.channelId, adapter, roomKey: event.roomKey, eventId: event.eventId, displayName: event.displayName, reply
    });
}
export function assertBusinessResult(result: unknown): asserts result is BusinessResult {
    try {
        assertGameplayResult(result);
    }
    catch (cause) {
        throw new BusinessError("INTERNAL_ERROR", cause instanceof Error ? cause.message : "业务响应无效", undefined, { cause });
    }
}
