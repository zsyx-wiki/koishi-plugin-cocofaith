import { CallbackDisposable } from "cocofaith-sdk/core";
import { BusinessError } from "./errors";
interface RegisteredInterface {
    provider: string;
    name: string;
    version: string;
    value: unknown;
}
const SAFE_INTERFACE_NAME = /^[a-z][a-z0-9_.-]{0,63}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
export class BusinessInterfaceRegistry {
    private entries = new Map<string, RegisteredInterface>();
    private providerKeys = new Map<string, Set<string>>();
    provide<T>(provider: string, name: string, value: T, version = "1.0.0") {
        if (!SAFE_INTERFACE_NAME.test(name))
            throw new BusinessError("INVALID_INPUT", `非法接口名称：${name}`);
        if (!SAFE_VERSION.test(version))
            throw new BusinessError("INVALID_INPUT", `接口版本必须使用 semver：${version}`);
        const key = this.key(provider, name);
        if (this.entries.has(key))
            throw new BusinessError("INTERFACE_EXISTS", `接口已注册：${provider}.${name}`);
        const stableValue = value && typeof value === "object" ? Object.freeze(value) : value;
        this.entries.set(key, {
            provider, name, version, value: stableValue
        });
        const keys = this.providerKeys.get(provider) ?? new Set();
        keys.add(key);
        this.providerKeys.set(provider, keys);
        return new CallbackDisposable(() => {
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
        const entry = this.entries.get(this.key(provider, name));
        if (!entry)
            throw new BusinessError("INTERFACE_NOT_FOUND", `接口不存在：${provider}.${name}`);
        return entry.value as T;
    }
    removeProvider(provider: string) {
        for (const key of this.providerKeys.get(provider) ?? [])
            this.entries.delete(key);
        this.providerKeys.delete(provider);
    }
    list() {
        return [...this.entries.values()].map(({ value: _value, ...metadata }) => metadata);
    }
    clear() {
        this.entries.clear();
        this.providerKeys.clear();
    }
    private key(provider: string, name: string) {
        return `${provider}:${name}`;
    }
}
