export const BUSINESS_ERROR_CATALOG = {
    ROOM_OCCUPIED: "本群已有游戏房间，请先完成或解散当前房间。",
    NOT_FOUND: "请求的业务或资源不存在。", NOT_ALLOWED: "当前操作不被允许。",
    INVALID_INPUT: "输入参数不正确。", INSUFFICIENT_RESOURCE: "资源不足。",
    CONFLICT: "操作与当前状态冲突。", INTERNAL_ERROR: "业务执行失败，请稍后重试。",
    MODULE_DISABLED: "业务模块未启用。", MODULE_NOT_READY: "业务模块尚未就绪。",
    MODULE_EXISTS: "业务模块已经注册。", DEPENDENCY_MISSING: "业务依赖不存在。",
    DEPENDENCY_DISABLED: "业务依赖未启用。", DEPENDENCY_IN_USE: "业务仍被其他模块依赖。",
    DEPENDENCY_CYCLE: "业务依赖存在循环。", CONFIG_INVALID: "业务配置无效。",
    LIFECYCLE_FAILED: "业务生命周期执行失败。", INTERFACE_NOT_FOUND: "跨业务接口不存在。",
    INTERFACE_FORBIDDEN: "未声明依赖，不能访问目标业务接口。", INTERFACE_EXISTS: "跨业务接口已经注册。",
    COMMAND_CONFLICT: "业务命令存在冲突。", COMMAND_INCOMPLETE: "命令需要子命令。",
    COMMAND_SCENE_FORBIDDEN: "当前会话类型不能使用该命令。",
    LIMIT_REACHED: "操作次数或持有数量已达上限。",
    UNREGISTERED: "用户尚未注册。",
} as const;
export type BusinessErrorCode = keyof typeof BUSINESS_ERROR_CATALOG;
export class BusinessError extends Error {
    constructor(readonly code: BusinessErrorCode, message: string = BUSINESS_ERROR_CATALOG[code as keyof typeof BUSINESS_ERROR_CATALOG] ?? String(code), readonly details?: Record<string, unknown>, options?: ErrorOptions) {
        super(message, options);
        this.name = "BusinessError";
    }
}
export function businessFailure(error: unknown) {
    if (error instanceof BusinessError) {
        return {
            ok: false as const, code: error.code, message: error.message, details: error.details
        };
    }
    if (error && typeof error === "object" && error.constructor?.name === "FaithCoreError" && "code" in error) {
        const value = error as {
            code: string;
            message?: string;
            details?: Record<string, unknown>;
        };
        const mapped = CORE_TO_BUSINESS_ERROR[value.code] ?? "INTERNAL_ERROR";
        return {
            ok: false as const, code: mapped, message: value.message ?? BUSINESS_ERROR_CATALOG[mapped], details: value.details
        };
    }
    return {
        ok: false as const, code: "INTERNAL_ERROR", message: BUSINESS_ERROR_CATALOG.INTERNAL_ERROR
    };
}
const CORE_TO_BUSINESS_ERROR: Record<string, keyof typeof BUSINESS_ERROR_CATALOG> = {
    USER_NOT_FOUND: "NOT_FOUND", USER_DISABLED: "NOT_ALLOWED", IDENTITY_NOT_FOUND: "NOT_FOUND",
    IDENTITY_ALREADY_BOUND: "CONFLICT", UID_EXHAUSTED: "INTERNAL_ERROR", INSUFFICIENT_BALANCE: "INSUFFICIENT_RESOURCE",
    ITEM_NOT_FOUND: "NOT_FOUND", ITEM_INSUFFICIENT: "INSUFFICIENT_RESOURCE", ITEM_LIMIT_EXCEEDED: "CONFLICT",
    PERMISSION_DENIED: "NOT_ALLOWED", TRANSACTION_CONFLICT: "CONFLICT", IDEMPOTENCY_CONFLICT: "CONFLICT",
    VALIDATION_FAILED: "INVALID_INPUT", LIFECYCLE_FAILED: "LIFECYCLE_FAILED", NOT_FOUND: "NOT_FOUND", CONFLICT: "CONFLICT",
    DATA_INTEGRITY_ERROR: "INTERNAL_ERROR",
};
