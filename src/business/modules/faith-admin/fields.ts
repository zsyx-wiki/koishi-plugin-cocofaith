import { CallbackDisposable, type FaithDisposable } from "cocofaith-sdk/core";
export interface FaithAdminNumericOperation {
    actorUid: number;
    targetUid: number;
    delta: number;
    /** 全体操作时提供。业务应将其作为事务幂等键，避免平台事件重投导致重复修改。 */
    operationId?: string;
}
export interface FaithAdminNumericField {
    name: string;
    description?: string;
    change(operation: FaithAdminNumericOperation): void | string | Promise<void | string>;
}
export interface FaithAdminNumericFieldsApi {
    register(field: FaithAdminNumericField): FaithDisposable;
    get(name: string): Readonly<FaithAdminNumericField> | undefined;
    list(): Readonly<FaithAdminNumericField>[];
}
export class FaithAdminFieldRegistry {
    private fields = new Map<string, Readonly<FaithAdminNumericField>>();
    register(field: FaithAdminNumericField) {
        const name = field.name?.trim();
        if (!name || name.length > 32 || typeof field.change !== "function")
            throw new Error("管理数值字段定义无效");
        if (this.fields.has(name))
            throw new Error(`管理数值字段已注册：${name}`);
        const frozen = Object.freeze({ ...field, name });
        this.fields.set(name, frozen);
        return new CallbackDisposable(() => {
            if (this.fields.get(name) === frozen)
                this.fields.delete(name);
        });
    }
    get(name: string) {
        return this.fields.get(name.trim());
    }
    list() {
        return [...this.fields.values()];
    }
    clear() {
        this.fields.clear();
    }
}
