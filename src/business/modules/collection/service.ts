import type { FaithBusinessCoreScope } from "cocofaith-sdk/core";
import { Logger } from "koishi";
import { BusinessError } from "../../framework/errors";
import type { TitleServiceApi } from "../title";
import { CollectionCatalog, type CollectionEntry } from "./catalog";
export interface CollectionState {
    uid: number;
    items: readonly string[];
}
export interface CollectionProgress {
    category: string;
    pool: string;
    collected: number;
    total: number;
}
export interface CollectionPage {
    page: number;
    pages: number;
    total: number;
    entries: readonly (CollectionEntry & {
        collected: boolean;
    })[];
}
interface CollectionRow extends Record<string, unknown> {
    uid: number;
    items: string[];
    updated_at: Date;
}
export class CollectionService {
    readonly catalog: CollectionCatalog;
    private logger = new Logger("cocofaith-business-collection");
    private refreshing = false;
    private awardCatalog?: ReadonlyMap<string, Readonly<CollectionEntry>>;
    private milestones: Array<{
        title: string;
        items: string[];
    }> = [];
    constructor(private core: FaithBusinessCoreScope, private titles: TitleServiceApi) {
        this.catalog = new CollectionCatalog(core.items);
    }
    async state(uid: number): Promise<CollectionState> {
        const rows = await this.core.table.get<CollectionRow>({ uid });
        return Object.freeze({ uid, items: Object.freeze(readItems(rows[0]?.items)) });
    }
    async record(uid: number, itemIds: readonly string[]) {
        if (!Array.isArray(itemIds) || itemIds.length > 10000 || itemIds.some((id) => typeof id !== "string"))
            throw new BusinessError("INVALID_INPUT", "图鉴物品列表无效");
        const catalog = this.catalog.snapshot();
        const eligible = [...new Set(itemIds)].filter((id) => catalog.has(id));
        const current = new Set((await this.state(uid)).items);
        if (eligible.every((id) => current.has(id))) {
            await this.award(uid, current);
            return 0;
        }
        const result = await this.core.transaction.run(uid, async (tx) => {
            const rows = await tx.table.get<CollectionRow>({ uid }), previous = rows[0];
            const owned = new Set(readItems(previous?.items)), before = owned.size;
            eligible.forEach((id) => owned.add(id));
            const added = owned.size - before;
            if (added) {
                const patch = { items: [...owned], updated_at: new Date() };
                if (previous)
                    await tx.table.set({ uid }, patch);
                else
                    await tx.table.create({ uid, ...patch });
            }
            return { added, owned };
        }, { source: "collection.record" });
        await this.award(uid, result.owned);
        if (result.added)
            this.logger.debug("图鉴点亮 uid=%s added=%s", uid, result.added);
        return result.added;
    }
    async refresh(uid: number) {
        const stacks = await this.core.items.getInventoryStacks(uid);
        return this.record(uid, stacks.filter((s) => s.quantity > 0).map((s) => s.item_id));
    }
    async has(uid: number, item: string) {
        const definition = this.core.items.resolve(item);
        return !!definition && (await this.state(uid)).items.includes(definition.item_id);
    }
    async progress(uid: number): Promise<CollectionProgress[]> {
        const owned = new Set((await this.state(uid)).items), groups = new Map<string, CollectionProgress>();
        for (const [id, entry] of this.catalog.snapshot()) {
            const key = JSON.stringify([entry.pool, entry.category]);
            const row = groups.get(key) ?? {
                category: entry.category, pool: entry.pool, collected: 0, total: 0
            };
            row.total++;
            if (owned.has(id))
                row.collected++;
            groups.set(key, row);
        }
        return [...groups.values()];
    }
    async details(uid: number, limited = false, page = 1): Promise<CollectionPage> {
        if (!Number.isSafeInteger(page) || page < 1)
            throw new BusinessError("INVALID_INPUT", "页码必须是正整数");
        const owned = new Set((await this.state(uid)).items);
        const entries = [...this.catalog.snapshot().values()].filter((e) => limited ? !!e.pool : !e.pool && (["EX", "SP", "UR", "SSS"].includes(e.item.level) || e.category === "彩蛋"));
        const pages = Math.max(1, Math.ceil(entries.length / 12));
        if (page > pages)
            throw new BusinessError("INVALID_INPUT", `仅有 ${pages} 页`);
        return {
            page, pages, total: entries.length, entries: entries.slice((page - 1) * 12, page * 12).map((entry) => ({ ...entry, collected: owned.has(entry.item.item_id) }))
        };
    }
    async refreshAll() {
        if (this.refreshing)
            throw new BusinessError("CONFLICT", "图鉴刷新正在进行");
        this.refreshing = true;
        let cursor = 0, checked = 0, added = 0, failed = 0;
        try {
            while (true) {
                if (this.core.lifecycle.disposed)
                    throw new BusinessError("MODULE_DISABLED");
                const uids = await this.core.users.listUids(cursor, 100);
                if (!uids.length)
                    break;
                for (const uid of uids) {
                    if (this.core.lifecycle.disposed)
                        throw new BusinessError("MODULE_DISABLED");
                    try {
                        added += await this.refresh(uid);
                    }
                    catch (error) {
                        failed++;
                        this.logger.warn("图鉴刷新失败 uid=%s %s", uid, error);
                    }
                    checked++;
                }
                cursor = uids[uids.length - 1];
            }
            this.logger.info("图鉴刷新 checked=%s added=%s failed=%s", checked, added, failed);
            return {
                checked, added, failed
            };
        }
        finally {
            this.refreshing = false;
        }
    }
    private async award(uid: number, owned: ReadonlySet<string>) {
        const catalog = this.catalog.snapshot();
        if (catalog !== this.awardCatalog) {
            const normal = [...catalog.values()].filter((entry) => !entry.pool);
            const targets: Array<[
                string,
                (entry: CollectionEntry) => boolean
            ]> = [
                ["void-collector", (e) => e.item.level === "SP"],
                ["great-collector", (e) => e.item.level === "SSS"],
                ["easter-egg-collector", (e) => e.category === "彩蛋"],
            ];
            this.milestones = targets.map(([title, filter]) => ({ title, items: normal.filter(filter).map((e) => e.item.item_id) }));
            this.awardCatalog = catalog;
        }
        for (const { title, items } of this.milestones) {
            if (items.length && items.every((id) => owned.has(id)))
                await this.titles.grant(uid, title);
        }
    }
}
function readItems(value: unknown): string[] {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string"))
        throw new BusinessError("INTERNAL_ERROR", "图鉴记录格式异常");
    return [...new Set(value)];
}
