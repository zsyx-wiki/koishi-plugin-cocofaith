import { BusinessError } from "./errors";
import type { BusinessCommand, BusinessEvent } from "./types";
export interface BusinessCommandMatch {
    readonly business: string;
    readonly command: BusinessCommand;
    readonly commandId: string;
    readonly path: readonly string[];
    readonly args: readonly string[];
}
interface RegisteredRoot {
    business: string;
    command: BusinessCommand;
}
interface CompiledCommand {
    readonly command: BusinessCommand;
    readonly aliases: ReadonlyMap<string, CompiledCommand>;
}
const TOKEN_PATTERN = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
const FIRST_TOKEN_PATTERN = new RegExp(TOKEN_PATTERN.source);

export class BusinessCommandRouter {
    private roots = new Map<string, RegisteredRoot>();
    private byBusiness = new Map<string, string[]>();
    private dynamicRoots = new Map<string, BusinessCommand[]>();
    private compiled = new WeakMap<BusinessCommand, CompiledCommand>();
    register(business: string, commands: readonly BusinessCommand[]) {
        validateTree(commands, business);
        const additions: Array<{
            alias: string;
            command: BusinessCommand;
        }> = [];
        for (const command of commands) {
            this.compile(command);
            for (const raw of command.commands)
                additions.push({ alias: normalizeToken(raw), command });
        }
        for (const { alias } of additions) {
            const existing = this.roots.get(alias);
            if (existing)
                throw new BusinessError("COMMAND_CONFLICT", `命令 ${alias} 已由业务 ${existing.business} 注册。`);
        }
        const aliases = additions.map(({ alias }) => alias);
        for (const { alias, command } of additions)
            this.roots.set(alias, { business, command });
        this.byBusiness.set(business, aliases);
        const dynamic = commands.filter((command) => !!command.match);
        if (dynamic.length)
            this.dynamicRoots.set(business, dynamic);
    }
    unregister(business: string) {
        for (const alias of this.byBusiness.get(business) ?? [])
            this.roots.delete(alias);
        this.byBusiness.delete(business);
        this.dynamicRoots.delete(business);
    }
    acceptsCommand(content: string): boolean {
        const first = FIRST_TOKEN_PATTERN.exec(content.trimStart().replace(/^\/+/, ""));
        if (first && this.roots.has(normalizeToken(decodeToken(first))))
            return true;
        const value = content.trim();
        if (!value)
            return false;
        for (const commands of this.dynamicRoots.values())
            for (const command of commands)
                if (command.match!(value))
                    return true;
        return false;
    }
    resolve(event: BusinessEvent): BusinessCommandMatch | null {
        const tokens = tokenize(event.content);
        if (!tokens.length)
            return null;
        const root = this.roots.get(normalizeToken(tokens[0]));
        if (!root) {
            const value = event.content.trim();
            for (const [business, commands] of this.dynamicRoots) {
                for (const command of commands)
                    if (command.match!(value)) {
                        assertScene(command, event);
                        if (!command.execute)
                            throw new BusinessError("COMMAND_INCOMPLETE", `动态命令 ${command.id} 没有处理器。`);
                        return {
                            business, command, commandId: command.id, path: [command.id], args: []
                        };
                    }
            }
            return null;
        }
        let compiled = this.compile(root.command), command = compiled.command, index = 1;
        const path = [command.id];
        assertScene(command, event);
        while (index < tokens.length && command.children?.length) {
            const token = normalizeToken(tokens[index]);
            const child = compiled.aliases.get(token);
            if (!child)
                break;
            compiled = child;
            command = child.command;
            path.push(command.id);
            index++;
            assertScene(command, event);
        }
        if (!command.execute)
            throw new BusinessError("COMMAND_INCOMPLETE", `命令 ${tokens.slice(0, index).join(" ")} 需要子命令。`);
        return {
            business: root.business, command, commandId: path.join("."), path, args: tokens.slice(index)
        };
    }
    list() {
        const seen = new Set<BusinessCommand>();
        const result: Array<{ business: string; command: BusinessCommand }> = [];
        for (const { business, command } of this.roots.values()) {
            if (seen.has(command)) continue;
            seen.add(command);
            result.push({ business, command });
        }
        for (const [business, commands] of this.dynamicRoots)
            for (const command of commands) {
                if (seen.has(command))
                    continue;
                seen.add(command);
                result.push({ business, command });
            }
        return result;
    }
    private compile(command: BusinessCommand): CompiledCommand {
        const cached = this.compiled.get(command);
        if (cached)
            return cached;
        const aliases = new Map<string, CompiledCommand>();
        for (const child of command.children ?? []) {
            const compiledChild = this.compile(child);
            for (const alias of child.commands)
                aliases.set(normalizeToken(alias), compiledChild);
        }
        const compiled = Object.freeze({ command, aliases });
        this.compiled.set(command, compiled);
        return compiled;
    }
}
function assertScene(command: BusinessCommand, event: BusinessEvent) {
    if (command.scenes && !command.scenes.includes(event.scene))
        throw new BusinessError("COMMAND_SCENE_FORBIDDEN");
}
function validateTree(commands: readonly BusinessCommand[], business: string, parent = business) {
    const ids = new Set<string>(), aliases = new Set<string>();
    for (const command of commands) {
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(command.id))
            throw new BusinessError("INVALID_INPUT", `非法命令 ID：${command.id}`);
        if (ids.has(command.id))
            throw new BusinessError("COMMAND_CONFLICT", `${parent} 存在重复命令 ID：${command.id}`);
        ids.add(command.id);
        if (!command.commands.length && !command.match)
            throw new BusinessError("INVALID_INPUT", `命令 ${command.id} 缺少触发词或动态匹配器。`);
        if (command.match && parent !== business)
            throw new BusinessError("INVALID_INPUT", `动态命令 ${command.id} 只能位于根节点。`);
        for (const raw of command.commands) {
            const alias = normalizeToken(raw);
            if (!alias || /\s/.test(alias))
                throw new BusinessError("INVALID_INPUT", `命令触发词只能是单个词：${raw}`);
            if (aliases.has(alias))
                throw new BusinessError("COMMAND_CONFLICT", `${parent} 存在重复触发词：${raw}`);
            aliases.add(alias);
        }
        if (!command.execute && !command.children?.length)
            throw new BusinessError("INVALID_INPUT", `命令 ${command.id} 没有处理器或子命令。`);
        if (command.children)
            validateTree(command.children, business, `${parent}.${command.id}`);
    }
}
function normalizeToken(value: string) {
    return value.trim().replace(/^\/+/, "").toLocaleLowerCase();
}
export function tokenize(content: string) {
    const value = content.trim().replace(/^\/+/, "");
    if (!value)
        return [];
    const result: string[] = [];
    for (const match of value.matchAll(TOKEN_PATTERN))
        result.push(decodeToken(match));
    return result;
}
function decodeToken(match: RegExpMatchArray) {
    return (match[1] ?? match[2] ?? match[3]).replace(/\\([\\"'])/g, "$1");
}
