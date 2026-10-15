import type { FaithBusinessCoreScope, FaithItemDefinition } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import { formatItem } from "../../shared/item-format";
export interface FaithSaleResult {
    quantity: number;
    gold: number;
    kinds: number;
    item?: Readonly<FaithItemDefinition>;
    level?: string;
    keptOne?: boolean;
}
export class FaithSaleService {
    constructor(private core: FaithBusinessCoreScope) {
    }
    async sell(uid: number, itemKey: string, requested: number | "all"): Promise<FaithSaleResult> {
        const item = this.requireMarketable(itemKey);
        return this.core.transaction.run(uid, async (tx) => {
            const owned = await tx.items.getQuantity(item.item_id);
            if (!owned)
                throw new BusinessError("NOT_FOUND", `你的背包中没有${formatItem(item)}。`);
            const quantity = requested === "all" ? owned : requested;
            assertQuantity(quantity);
            if (quantity > owned)
                throw new BusinessError("INSUFFICIENT_RESOURCE", `你只有 ${owned} 个${formatItem(item)}。`);
            const gold = safeTotal(item.price, quantity);
            await tx.items.take(item.item_id, quantity);
            await tx.economy.creditFixed({ gold });
            return Object.freeze({
                quantity, gold, kinds: 1, item
            });
        }, { source: "faith.sell_item" });
    }
    async sellLevel(uid: number, rawLevel: string, force: boolean): Promise<FaithSaleResult> {
        const level = rawLevel.trim().toUpperCase();
        if (!level || !this.core.items.levels.get(level))
            throw new BusinessError("INVALID_INPUT", "不存在这个物品等级。");
        return this.core.transaction.run(uid, async (tx) => {
            const stacks = await tx.items.getStacks();
            const sales = stacks.flatMap((stack) => {
                const item = this.core.items.get(stack.item_id);
                if (!item || item.level.toUpperCase() !== level || !item.marketable || item.price <= 0)
                    return [];
                const quantity = force ? stack.quantity : Math.max(0, stack.quantity - 1);
                return quantity ? [{ item, quantity }] : [];
            });
            if (!sales.length)
                throw new BusinessError("NOT_FOUND", `没有可出售的 ${level} 级物品${force ? "" : "（默认每种保留 1 个）"}。`);
            let quantity = 0, gold = 0;
            for (const sale of sales) {
                quantity += sale.quantity;
                gold = safeAdd(gold, safeTotal(sale.item.price, sale.quantity));
                await tx.items.take(sale.item.item_id, sale.quantity);
            }
            await tx.economy.creditFixed({ gold });
            return Object.freeze({
                quantity, gold, kinds: sales.length, level, keptOne: !force
            });
        }, { source: force ? "faith.force_sell_level" : "faith.sell_level" });
    }
    private requireMarketable(key: string) {
        const value = key.trim();
        if (!value)
            throw new BusinessError("INVALID_INPUT", "请输入要出售的物品名称和数量。");
        const item = this.core.items.resolve(value);
        if (!item)
            throw new BusinessError("NOT_FOUND", `没有找到物品【${value}】。`);
        if (!item.marketable)
            throw new BusinessError("NOT_ALLOWED", `${formatItem(item)}不可出售。`);
        if (item.price <= 0)
            throw new BusinessError("NOT_ALLOWED", `${formatItem(item)}没有出售价值。`);
        return item;
    }
}
export function parseSaleArgs(args: readonly string[]) {
    if (!args.length)
        throw new BusinessError("INVALID_INPUT", "格式：信仰 卖出 [物品名] [数量/全部]");
    const last = args.at(-1)!;
    if (["all", "全部"].includes(last.toLocaleLowerCase()))
        return { item: args.slice(0, -1).join(" "), quantity: "all" as const };
    if (/^\d+$/.test(last) && args.length > 1)
        return { item: args.slice(0, -1).join(" "), quantity: Number(last) };
    return { item: args.join(" "), quantity: 1 };
}
function assertQuantity(value: number) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 1000000)
        throw new BusinessError("INVALID_INPUT", "出售数量必须是 1-1000000 的整数。");
}
function safeTotal(price: number, quantity: number) {
    const value = price * quantity;
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new BusinessError("INVALID_INPUT", "出售总价无效或超过安全范围。");
    return value;
}
function safeAdd(left: number, right: number) {
    const value = left + right;
    if (!Number.isSafeInteger(value))
        throw new BusinessError("INVALID_INPUT", "出售总价超过安全范围。");
    return value;
}
