import type { FaithAdminNumericField } from "./api";
export type { FaithAdminNumericOperation, FaithAdminNumericField, FaithAdminNumericFieldsApi } from "./api";
import { CallbackDisposable } from "cocofaith-sdk/core";



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
