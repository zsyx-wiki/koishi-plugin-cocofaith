import type { CoreDatabase } from "./service";
export interface AtomicTableDefinition {
    name: string;
    primary: readonly string[];
}
export interface FaithAtomicTableApi {
    get<T extends object = Record<string, unknown>>(query?: Record<string, unknown>): Promise<T[]>;
    create<T extends object>(value: T): Promise<T>;
    set(query: Record<string, unknown>, patch: Record<string, unknown>): Promise<{
        matched?: number;
    }>;
    remove(query: Record<string, unknown>): Promise<unknown>;
}
export function atomicTable(database: CoreDatabase, definition: AtomicTableDefinition | undefined, active: () => void): FaithAtomicTableApi {
    const table = () => {
        active();
        if (!definition)
            throw new Error("业务尚未注册独立表");
        return definition.name as never;
    };
    const query = (value: Record<string, unknown>) => {
        if (!value || Array.isArray(value) || !Object.keys(value).length)
            throw new Error("写操作必须指定查询条件");
        return value as never;
    };
    const api: FaithAtomicTableApi = {
        get: <T extends object = Record<string, unknown>>(value: Record<string, unknown> = {}) => database.get(table(), value as never) as unknown as Promise<T[]>,
        create: <T extends object>(value: T) => database.create(table(), value as never) as unknown as Promise<T>,
        set: (value: Record<string, unknown>, patch: Record<string, unknown>) => {
            const name = table();
            if (!patch || !Object.keys(patch).length || Object.keys(patch).some((key) => definition!.primary.includes(key)))
                throw new Error("更新不得为空或修改主键");
            return database.set(name, query(value), patch as never);
        },
        remove: (value: Record<string, unknown>) => database.remove(table(), query(value)),
    };
    return Object.freeze(api);
}
