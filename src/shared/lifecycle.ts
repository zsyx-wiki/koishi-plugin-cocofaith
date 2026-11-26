/** Lifecycle rejection is not a partial calculation: callers must fail outside the unavailable module. */
export const MODULE_NOT_READY = "MODULE_NOT_READY";

export function isLifecycleUnavailableError(error: unknown): boolean {
    return error !== null && typeof error === "object" && "code" in error && error.code === MODULE_NOT_READY;
}
