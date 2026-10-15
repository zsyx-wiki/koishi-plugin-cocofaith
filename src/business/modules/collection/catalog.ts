import type { FaithBusinessItemsApi, FaithItemDefinition } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
export interface CollectionRule {
    excluded?: boolean;
    pool?: string;
    category?: string;
}
export interface CollectionEntry {
    item: Readonly<FaithItemDefinition>;
    category: string;
    pool: string;
}
const LIMITED = new Map([
    ["万相假面", "同人限定"], ["无知的冠冕", "同人限定"], ["无餍的欢愉", "同人限定"],
]);
export class CollectionCatalog {
    private rules = new Map<string, Readonly<CollectionRule>>();
    private revision = -1;
    private entries = new Map<string, Readonly<CollectionEntry>>();
    constructor(private items: FaithBusinessItemsApi) {
    }
    configure(itemId: string, rule: CollectionRule) {
        itemId = this.items.require(itemId).item_id;
        if (this.rules.has(itemId))
            throw new BusinessError("CONFLICT", "该物品已有图鉴规则，请先卸载原规则");
        if (!rule || typeof rule !== "object" || (rule.excluded !== undefined && typeof rule.excluded !== "boolean"))
            throw new BusinessError("INVALID_INPUT", "图鉴规则无效");
        for (const value of [rule.pool, rule.category])
            if (value !== undefined && (typeof value !== "string" || !value.trim() || value.length > 32))
                throw new BusinessError("INVALID_INPUT", "图鉴分类或限定池名称无效");
        const saved = Object.freeze({
            excluded: rule.excluded, pool: rule.pool?.trim(), category: rule.category?.trim()
        });
        this.rules.set(itemId, saved);
        this.revision = -1;
        return () => {
            if (this.rules.get(itemId) === saved) {
                this.rules.delete(itemId);
                this.revision = -1;
            }
        };
    }
    snapshot(): ReadonlyMap<string, Readonly<CollectionEntry>> {
        if (this.revision === this.items.revision)
            return this.entries;
        const entries = new Map<string, Readonly<CollectionEntry>>();
        for (const item of this.items.all()) {
            const rule = this.rules.get(item.item_id);
            if (rule?.excluded || item.type === "容器" || item.openable)
                continue;
            const category = rule?.category ?? (["??", "URE"].includes(item.level) || item.type === "彩蛋" ? "彩蛋" : ["天赋", "道具"].includes(item.type) ? item.type : undefined);
            const pool = rule?.pool ?? (item.level === "URE" ? "限定彩蛋" : LIMITED.get(item.name) ?? "");
            if (category)
                entries.set(item.item_id, Object.freeze({
                    item, category, pool
                }));
        }
        this.entries = entries;
        this.revision = this.items.revision;
        return entries;
    }
}
