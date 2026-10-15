import { CallbackDisposable, type FaithBusinessCoreScope, type FaithDisposable } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import type { BusinessResult } from "../../framework/types";
export interface FaithAdminCommandContext {
    actorUid: number;
    args: readonly string[];
    core: FaithBusinessCoreScope;
    requestId?: string;
}
export interface FaithAdminCommand {
    business: string;
    command: string;
    description?: string;
    execute(context: FaithAdminCommandContext): BusinessResult | Promise<BusinessResult>;
}
export interface FaithAdminCommandsApi {
    register(command: FaithAdminCommand): FaithDisposable;
    list(): readonly Omit<Readonly<FaithAdminCommand>, "execute">[];
}
export class FaithAdminCommandRegistry {
    private commands = new Map<string, Readonly<FaithAdminCommand>>();
    register(input: FaithAdminCommand) {
        const business = input.business?.trim(), command = input.command?.trim();
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(business) || !command || command.length > 32 || /\s/.test(command) || typeof input.execute !== "function")
            throw new BusinessError("INVALID_INPUT", "管理命令定义无效。");
        if (this.commands.has(command))
            throw new BusinessError("CONFLICT", `信仰管理命令已注册：${command}`);
        const value = Object.freeze({
            ...input, business, command
        });
        this.commands.set(command, value);
        return new CallbackDisposable(() => {
            if (this.commands.get(command) === value)
                this.commands.delete(command);
        });
    }
    get(command: string) {
        return this.commands.get(command.trim());
    }
    list() {
        return Object.freeze([...this.commands.values()].map(({ execute: _, ...value }) => Object.freeze(value)));
    }
    clear() {
        this.commands.clear();
    }
}
