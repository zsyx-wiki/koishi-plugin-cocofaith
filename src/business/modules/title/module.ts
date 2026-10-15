import { contributeGameplay, provideGameplayInterface, useGameplayInterface } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { defineAdvancedGameplay } from "../../framework/types";
import { ADMIN_COMMANDS_API, FAITH_INFO, TITLE_API } from "../../shared/contracts";
import { MESSAGES } from "../../shared/messages";
import { BUILTIN_TITLES } from "./data";
import { TitleService } from "./service";
import type { TitleServiceApi } from "./types";
export function createTitleModule() {
    let service: TitleService;
    return defineAdvancedGameplay({
        name: "title", dependencies: ["faith_admin"],
        init(context) {
            context.core.registerTable({
                uid: "unsigned", titles: "json", active: "string", updated_at: "timestamp",
            }, { primary: "uid", indexes: ["active"] });
            service = new TitleService(context.core);
            service.registerMany(BUILTIN_TITLES);
            context.core.lifecycle.track(context.core.bonuses.registerProvider(async ({ uid, type }) => {
                const state = await service.state(uid, false), result = [];
                for (const id of state.titles) {
                    const title = service.get(id);
                    if (!title)
                        continue;
                    for (const bonus of title.bonuses ?? [])
                        if (bonus.type === type && (bonus.activeWhen !== "equipped" || state.active === id)) {
                            result.push({
                                source: `title:${title.id}`, type, modifier: bonus.modifier, fixedBonus: bonus.fixedBonus, detail: bonus.detail ?? `称号【${title.name}】`
                            });
                        }
                }
                return result;
            }, { id: "title-bonuses" }));
            contributeGameplay(context, FAITH_INFO, async ({ uid }) => {
                const active = await service.getActiveForKnownUser(uid);
                return MESSAGES.title.active(active?.name);
            }, { id: "active-title", priority: 10 });
            provideGameplayInterface(context, TITLE_API, createPublicApi(service), { version: "1.0.0" });
            const admin = useGameplayInterface(context, ADMIN_COMMANDS_API);
            context.core.lifecycle.track(admin.register({
                business: "title", command: "称号", description: "给予或收回用户称号", async execute({ args, core }) {
                    if (args.length < 3)
                        throw new BusinessError("INVALID_INPUT", "格式：信仰管理 称号 [uid] [给予|收回] [称号名]");
                    const uid = Number(args[0]), action = args[1], name = args.slice(2).join(" ").trim();
                    if (!Number.isSafeInteger(uid) || !name)
                        throw new BusinessError("INVALID_INPUT", "UID 或称号名无效。");
                    await core.users.require(uid);
                    if (action === "给予") {
                        const changed = await service.grant(uid, name);
                        return { type: "text", content: MESSAGES.title.granted(uid, service.require(name).name, changed) };
                    }
                    if (action === "收回") {
                        const title = service.require(name), changed = await service.revoke(uid, title.id);
                        return { type: "text", content: MESSAGES.title.revoked(uid, title.name, changed) };
                    }
                    throw new BusinessError("INVALID_INPUT", "操作只能是“给予”或“收回”。");
                }
            }));
        },
        dispose() {
            service.clearCache();
        },
        commands: [{
                id: "title", triggers: ["称号"], scenes: ["group"], description: "查看和使用称号",
                run() {
                    return { type: "text", content: MESSAGES.title.help };
                },
                children: [
                    {
                        id: "list", triggers: ["列表"], async run(ctx) {
                            const titles = await service.listOwned(requireUid(ctx.uid)), active = await service.getActive(requireUid(ctx.uid));
                            if (!titles.length)
                                return { type: "text", content: MESSAGES.title.empty };
                            return { type: "text", content: MESSAGES.title.list(titles.map((title) => ({ name: title.name, active: active?.id === title.id }))) };
                        }
                    },
                    {
                        id: "detail", triggers: ["详情"], async run(ctx) {
                            const name = ctx.args.join(" ").trim();
                            if (!name)
                                throw new BusinessError("INVALID_INPUT", "格式：称号 详情 [称号名]");
                            const owned = await service.listOwned(requireUid(ctx.uid)), title = service.resolve(name);
                            if (!title || !owned.some((item) => item.id === title.id))
                                throw new BusinessError("NOT_FOUND", `你尚未拥有称号【${name}】。`);
                            const bonuses = title.bonuses?.length ? title.bonuses.map(formatBonus).join("、") : "无";
                            return { type: "text", content: MESSAGES.title.detail(title.name, title.description, title.source, bonuses) };
                        }
                    },
                    {
                        id: "use", triggers: ["使用", "佩戴"], async run(ctx) {
                            const name = ctx.args.join(" ").trim();
                            if (!name)
                                throw new BusinessError("INVALID_INPUT", "格式：称号 使用 [称号名]");
                            const title = await service.use(requireUid(ctx.uid), name);
                            return { type: "text", content: MESSAGES.title.used(title!.name) };
                        }
                    },
                ],
            }],
    });
}
export const titleModule = createTitleModule();
function requireUid(uid: number | null) {
    if (uid === null)
        throw new BusinessError("UNREGISTERED");
    return uid;
}
function formatBonus(value: {
    modifier?: number;
    fixedBonus?: number;
    detail?: string;
}) {
    if (value.detail)
        return value.detail;
    return [value.modifier ? `${value.modifier > 0 ? "+" : ""}${value.modifier * 100}%` : "", value.fixedBonus ? `${value.fixedBonus > 0 ? "+" : ""}${value.fixedBonus}` : ""].filter(Boolean).join(" ");
}
function createPublicApi(service: TitleService): TitleServiceApi {
    const api: TitleServiceApi = {
        register: (value, options) => service.register(value, options), registerMany: (values, options) => service.registerMany(values, options),
        unregister: (value, options) => service.unregister(value, options), get: (id) => service.get(id), getByName: (name) => service.getByName(name),
        resolve: (value) => service.resolve(value), all: () => service.all(), listOwned: (uid) => service.listOwned(uid), getActive: (uid) => service.getActive(uid),
        grant: (uid, value) => service.grant(uid, value), revoke: (uid, value) => service.revoke(uid, value), use: (uid, value) => service.use(uid, value),
    };
    return Object.freeze(api);
}
