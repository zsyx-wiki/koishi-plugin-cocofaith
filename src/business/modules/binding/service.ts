import type { FaithBusinessCoreScope, IdentityInput } from "cocofaith-sdk/core";
import { createHash, randomBytes } from "node:crypto";
import { BusinessError } from "../../framework/errors";
import type { BusinessEvent, BusinessResult } from "../../framework/types";
import { MESSAGES } from "../../shared/messages";
import type { BindingConfig } from "./config";
type ReplyChannel = NonNullable<BusinessEvent["reply"]>;
type PendingState = "issued" | "claiming" | "claimed" | "confirming";
interface PendingBinding {
    readonly qq: string;
    readonly onebotIdentity: Readonly<IdentityInput>;
    readonly reply: ReplyChannel;
    readonly tokenAHash: string;
    state: PendingState;
    expiresAt: number;
    tokenBHash?: string;
    qqbotUid?: number;
    qqbotIdentity?: Readonly<IdentityInput>;
    qqbotKey?: string;
}
export interface BindingUserInfo {
    adapter: string;
    uid: number | null;
    qqAccounts: readonly string[];
}
export class BindingService {
    private readonly pending = new Set<PendingBinding>();
    private readonly byTokenA = new Map<string, PendingBinding>();
    private readonly byTokenB = new Map<string, PendingBinding>();
    private readonly byQq = new Map<string, PendingBinding>();
    private readonly byQqbot = new Map<string, PendingBinding>();
    private readonly cleanupTimer: NodeJS.Timeout;
    constructor(private readonly core: FaithBusinessCoreScope, private config: Readonly<BindingConfig>) {
        this.cleanupTimer = setInterval(() => this.cleanupExpired(), 30000);
        this.cleanupTimer.unref?.();
    }
    configure(config: Readonly<BindingConfig>) {
        this.config = config;
        this.cleanupExpired();
        while (this.pending.size > config.maxPending) {
            const oldest = this.pending.values().next().value as PendingBinding | undefined;
            if (!oldest)
                break;
            this.remove(oldest);
        }
    }
    async issue(event: Readonly<BusinessEvent>): Promise<{
        kind: "already-bound";
        uid: number;
    } | {
        kind: "issued";
        tokenA: string;
        expiresIn: number;
    }> {
        const identity = requireOneBotPrivate(event);
        if (!event.reply)
            throw new BusinessError("NOT_ALLOWED", "当前 OneBot 会话不能接收后续私聊消息。");
        const owner = await this.core.identities.resolve(identity);
        if (owner !== null)
            return { kind: "already-bound", uid: owner };
        this.cleanupExpired();
        if (this.pending.size >= this.config.maxPending)
            throw new BusinessError("LIMIT_REACHED", "待确认绑定数量已达上限，请稍后重试。");
        const previous = this.byQq.get(identity.value);
        if (previous)
            this.remove(previous);
        const tokenA = createToken();
        const session: PendingBinding = {
            qq: identity.value,
            onebotIdentity: Object.freeze({ ...identity }),
            reply: event.reply,
            tokenAHash: hashToken(tokenA),
            state: "issued",
            expiresAt: Date.now() + this.config.tokenTtlSeconds * 1000,
        };
        this.pending.add(session);
        this.byTokenA.set(session.tokenAHash, session);
        this.byQq.set(session.qq, session);
        return {
            kind: "issued", tokenA, expiresIn: this.config.tokenTtlSeconds
        };
    }
    async claim(event: Readonly<BusinessEvent>, tokenA: string): Promise<{
        kind: "already-bound";
        uid: number;
        qq: string;
    } | {
        kind: "claimed";
        qq: string;
    }> {
        const { uid, identity } = requireRegisteredQqGroup(event);
        const session = this.lookup(this.byTokenA, tokenA, "TokenA");
        if (session.state !== "issued")
            throw new BusinessError("CONFLICT", "该绑定申请已经被使用或正在处理。");
        session.state = "claiming";
        try {
            const qqbotKey = identityKey(identity);
            const occupied = this.byQqbot.get(qqbotKey);
            if (occupied && occupied !== session)
                throw new BusinessError("CONFLICT", "当前 QQ 官方身份已有待确认绑定。");
            await this.core.users.require(uid);
            const currentUid = await this.core.identities.resolve(identity);
            if (currentUid !== uid)
                throw new BusinessError("CONFLICT", "当前 QQ 官方身份的 UID 已发生变化，请重新申请。");
            const onebotOwner = await this.core.identities.resolve(session.onebotIdentity);
            if (onebotOwner !== null) {
                if (onebotOwner === uid) {
                    this.remove(session);
                    return {
                        kind: "already-bound", uid, qq: session.qq
                    };
                }
                throw new BusinessError("CONFLICT", `该 OneBot QQ 已属于 UID ${onebotOwner}，不能自动合并用户数据。`);
            }
            const tokenB = createToken();
            session.tokenBHash = hashToken(tokenB);
            session.qqbotUid = uid;
            session.qqbotIdentity = Object.freeze({ ...identity });
            session.qqbotKey = qqbotKey;
            session.expiresAt = Date.now() + this.config.tokenTtlSeconds * 1000;
            session.state = "claimed";
            this.byTokenB.set(session.tokenBHash, session);
            this.byQqbot.set(qqbotKey, session);
            try {
                const result: BusinessResult = {
                    type: "text",
                    content: MESSAGES.binding.tokenB(tokenB, uid, session.qq, this.config.tokenTtlSeconds),
                    delivery: "proactive-required",
                };
                await session.reply(result);
            }
            catch (error) {
                this.rollbackClaim(session);
                throw new BusinessError("INTERNAL_ERROR", "TokenB 无法发送到 OneBot 私聊，请重新申请。", undefined, { cause: error });
            }
            return { kind: "claimed", qq: session.qq };
        }
        catch (error) {
            if (session.state === "claiming")
                session.state = "issued";
            throw error;
        }
    }
    async confirm(event: Readonly<BusinessEvent>, tokenB: string) {
        const identity = requireOneBotPrivate(event);
        const session = this.lookup(this.byTokenB, tokenB, "TokenB");
        if (session.state !== "claimed" || !session.qqbotIdentity || session.qqbotUid === undefined) {
            throw new BusinessError("CONFLICT", "该绑定申请尚未进入确认阶段。");
        }
        if (identityKey(session.onebotIdentity) !== identityKey(identity)) {
            throw new BusinessError("NOT_ALLOWED", "必须由创建 TokenA 的同一 OneBot QQ 确认。");
        }
        session.state = "confirming";
        try {
            const uid = session.qqbotUid;
            const currentQqbotUid = await this.core.identities.resolve(session.qqbotIdentity);
            if (currentQqbotUid !== uid)
                throw new BusinessError("CONFLICT", "当前 QQ 官方身份的 UID 已发生变化，请重新申请。");
            const onebotOwner = await this.core.identities.resolve(identity);
            if (onebotOwner !== null && onebotOwner !== uid) {
                throw new BusinessError("CONFLICT", `该 OneBot QQ 已属于 UID ${onebotOwner}，不能自动合并用户数据。`);
            }
            if (onebotOwner === null)
                await this.core.identities.bindExisting(uid, identity);
            this.remove(session);
            await this.core.hooks.emit("identity-linked", Object.freeze({
                uid, adapter: "onebot", qq: session.qq
            }));
            return { uid, qq: session.qq };
        }
        catch (error) {
            if (this.pending.has(session))
                session.state = "claimed";
            throw error;
        }
    }
    async userInfo(event: Readonly<BusinessEvent>): Promise<BindingUserInfo> {
        const identity = event.identity;
        if (!identity)
            throw new BusinessError("INVALID_INPUT", "当前消息没有可识别的平台身份。");
        const uid = event.uid;
        const rows = uid === null ? [] : await this.core.identities.list(uid);
        const qqAccounts = rows
            .filter((row) => row.adapter === "onebot" && row.type === "qq_account" && row.scope === "global")
            .map((row) => row.value);
        return Object.freeze({
            adapter: adapterDisplayName(identity.adapter),
            uid,
            qqAccounts: Object.freeze([...new Set(qqAccounts)].sort()),
        });
    }
    dispose() {
        clearInterval(this.cleanupTimer);
        for (const session of [...this.pending])
            this.remove(session);
    }
    private lookup(index: Map<string, PendingBinding>, token: string, label: string) {
        if (!isToken(token))
            throw new BusinessError("INVALID_INPUT", `${label} 格式无效。`);
        this.cleanupExpired();
        const session = index.get(hashToken(token));
        if (!session || session.expiresAt <= Date.now())
            throw new BusinessError("NOT_FOUND", "绑定令牌无效或已过期。");
        return session;
    }
    private rollbackClaim(session: PendingBinding) {
        if (session.tokenBHash)
            this.byTokenB.delete(session.tokenBHash);
        if (session.qqbotKey)
            this.byQqbot.delete(session.qqbotKey);
        session.tokenBHash = undefined;
        session.qqbotUid = undefined;
        session.qqbotIdentity = undefined;
        session.qqbotKey = undefined;
        session.state = "issued";
    }
    private cleanupExpired() {
        const now = Date.now();
        for (const session of this.pending)
            if (session.expiresAt <= now)
                this.remove(session);
    }
    private remove(session: PendingBinding) {
        this.pending.delete(session);
        this.byTokenA.delete(session.tokenAHash);
        if (session.tokenBHash)
            this.byTokenB.delete(session.tokenBHash);
        if (this.byQq.get(session.qq) === session)
            this.byQq.delete(session.qq);
        if (session.qqbotKey && this.byQqbot.get(session.qqbotKey) === session)
            this.byQqbot.delete(session.qqbotKey);
    }
}
function requireOneBotPrivate(event: Readonly<BusinessEvent>) {
    const identity = event.identity;
    if (event.scene !== "private" || !identity || identity.adapter !== "onebot" || identity.type !== "qq_account" || identity.scope !== "global") {
        throw new BusinessError("NOT_ALLOWED", "请使用 OneBot 机器人私聊发送“椰子水 申请绑定”。");
    }
    return identity;
}
function requireRegisteredQqGroup(event: Readonly<BusinessEvent>) {
    const identity = event.identity;
    if (event.scene !== "group" || event.uid === null || !identity || identity.adapter !== "qqbot"
        || identity.type !== "qqbot_member_openid" || identity.scope !== "group_chat" || !identity.scopeValue) {
        throw new BusinessError("UNREGISTERED", "请先在 QQ 官方机器人完成注册，再在群聊中进行绑定。");
    }
    return { uid: event.uid, identity };
}
function createToken() {
    return `CFA-${randomBytes(24).toString("base64url")}`;
}
function isToken(value: string) {
    return /^CFA-[A-Za-z0-9_-]{32}$/.test(value);
}
function hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
}
function identityKey(identity: Readonly<IdentityInput>) {
    return JSON.stringify([identity.adapter, identity.type, identity.value, identity.scope, identity.scopeValue ?? ""]);
}
function adapterDisplayName(adapter: string) {
    if (adapter === "qqbot")
        return "CoCoFaith QQ";
    if (adapter === "onebot")
        return "CoCoFaith OneBot";
    return `CoCoFaith ${adapter}`;
}
