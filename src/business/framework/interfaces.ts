import { CallbackDisposable } from "cocofaith-sdk/core";
import { BusinessError } from "./errors";
interface RegisteredInterface {
    provider: string;
    name: string;
    version: string;
    value: unknown;
    invoke?: InterfaceInvocation;
}
export type InterfaceInvocation = <T>(task: () => T) => T;
const SAFE_INTERFACE_NAME = /^[a-z][a-z0-9_.-]{0,63}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
export class BusinessInterfaceRegistry {
    private entries = new Map<string, RegisteredInterface>();
    private handles = new Map<string, unknown>();
    private providerKeys = new Map<string, Set<string>>();
    provide<T>(provider: string, name: string, value: T, version = "1.0.0", invoke?: InterfaceInvocation) {
        if (!SAFE_INTERFACE_NAME.test(name))
            throw new BusinessError("INVALID_INPUT", `非法接口名称：${name}`);
        if (!SAFE_VERSION.test(version))
            throw new BusinessError("INVALID_INPUT", `接口版本必须使用 semver：${version}`);
        const key = this.key(provider, name);
        if (this.entries.has(key))
            throw new BusinessError("INTERFACE_EXISTS", `接口已注册：${provider}.${name}`);
        const stableValue = value && typeof value === "object" ? Object.freeze(value) : value;
        const entry = { provider, name, version, value: stableValue, invoke };
        this.entries.set(key, entry);
        const keys = this.providerKeys.get(provider) ?? new Set();
        keys.add(key);
        this.providerKeys.set(provider, keys);
        return new CallbackDisposable(() => {
            if (this.entries.get(key) !== entry) return;
            this.entries.delete(key);
            keys.delete(key);
            if (!keys.size)
                this.providerKeys.delete(provider);
        });
    }
    use<T>(requester: string, provider: string, name: string, dependencies: ReadonlySet<string>): T {
        if (requester !== provider && !dependencies.has(provider)) {
            throw new BusinessError("INTERFACE_FORBIDDEN", `${requester} 未声明对 ${provider} 的依赖。`);
        }
        const key = this.key(provider, name);
        const resolve = () => {
            const entry = this.entries.get(key);
            if (!entry)
                throw new BusinessError("INTERFACE_NOT_FOUND", `接口不存在：${provider}.${name}`);
            return { value: entry.value, receiver: undefined as unknown, invoke: entry.invoke };
        };
        const { value } = resolve();
        // Scalar exports are values. Objects/functions are stable, read-only live handles.
        if (!isHandleValue(value)) return value as T;
        if (!this.handles.has(key))
            this.handles.set(key, createInterfaceHandle(resolve));
        return this.handles.get(key) as T;
    }
    removeProvider(provider: string) {
        for (const key of this.providerKeys.get(provider) ?? [])
            this.entries.delete(key);
        this.providerKeys.delete(provider);
    }
    list() {
        return [...this.entries.values()].map(({ value: _value, invoke: _invoke, ...metadata }) => metadata);
    }
    clear() {
        this.entries.clear();
        this.handles.clear();
        this.providerKeys.clear();
    }
    private key(provider: string, name: string) {
        return `${provider}:${name}`;
    }
}

function isHandleValue(value: unknown): value is object {
    return typeof value === "function" || (value !== null && typeof value === "object" && !Array.isArray(value));
}

/** Resolve again on every access/call, including methods captured during setup. */
function createInterfaceHandle(resolve: () => { value: unknown; receiver: unknown; invoke?: InterfaceInvocation }): object {
    const children = new Map<PropertyKey, object>();
    const callable = typeof resolve().value === "function";
    const target = callable ? (..._args: unknown[]) => undefined : Object.create(null);
    return new Proxy(target, {
        get(_target, property) {
            const parent = resolve().value as object;
            const value = Reflect.get(parent, property, parent);
            if (!isHandleValue(value)) return value;
            if (!children.has(property)) {
                children.set(property, createInterfaceHandle(() => {
                    const current = resolve();
                    const parent = current.value as object;
                    return { value: Reflect.get(parent, property, parent), receiver: parent, invoke: current.invoke };
                }));
            }
            return children.get(property);
        },
        apply(_target, _receiver, args) {
            const { value, receiver, invoke } = resolve();
            if (typeof value !== "function")
                throw new BusinessError("INTERFACE_NOT_FOUND", "接口方法已不存在");
            const call = () => Reflect.apply(value, receiver, args);
            return invoke ? invoke(call) : call();
        },
        has(_target, property) { return property in (resolve().value as object); },
        ownKeys() { return Reflect.ownKeys(resolve().value as object); },
        getOwnPropertyDescriptor(_target, property) {
            const descriptor = Reflect.getOwnPropertyDescriptor(resolve().value as object, property);
            return descriptor ? { configurable: true, enumerable: descriptor.enumerable } : undefined;
        },
        set() { return false; },
        defineProperty() { return false; },
        deleteProperty() { return false; },
        setPrototypeOf() { return false; },
        preventExtensions() { return false; },
    });
}
