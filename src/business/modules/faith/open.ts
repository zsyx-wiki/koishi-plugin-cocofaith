import type { FaithBusinessCoreScope, FaithOpenResult } from "cocofaith-sdk/core";
import { BusinessError } from "../../framework/errors";
import { formatItem } from "../../shared/item-format";
export class FaithOpenItemService {
    constructor(private core: FaithBusinessCoreScope, private random: () => number = Math.random) {
    }
    async open(uid: number, input: readonly string[]) {
        const parsed = parseOpenArgs(input), item = this.core.items.resolve(parsed.item);
        if (!item)
            throw new BusinessError("NOT_FOUND", `没有找到物品【${parsed.item}】。`);
        if (!item.openable)
            throw new BusinessError("NOT_ALLOWED", `物品${formatItem(item)}不能打开。`);
        return this.core.transaction.run(uid, async (tx) => {
            const held = await tx.items.getQuantity(item.item_id), quantity = parsed.all ? held : parsed.quantity;
            if (quantity < 1 || held < quantity)
                throw new BusinessError("NOT_FOUND", `背包中的${formatItem(item)}数量不足。`);
            if (quantity > 100)
                throw new BusinessError("INVALID_INPUT", "单次最多打开 100 个物品。");
            const total = emptyResult();
            for (let count = 0; count < quantity; count++)
                merge(total, this.core.items.rollOpenable(item.item_id, this.random));
            await tx.items.take(item.item_id, quantity);
            for (const [itemId, count] of Object.entries(total.items))
                await tx.items.give(itemId, count);
            const money = { gold: total.currencies.gold, ascension_score: total.currencies.ascension_score };
            if (money.gold || money.ascension_score)
                await tx.economy.creditFixed(money);
            if (total.currencies.audience_score)
                await tx.users.change({ audience_score: total.currencies.audience_score });
            return Object.freeze({
                item, quantity, currencies: Object.freeze(total.currencies), items: Object.freeze(total.items)
            });
        }, { source: "faith.open_item" });
    }
}
export function parseOpenArgs(args: readonly string[]) {
    if (!args.length)
        throw new BusinessError("INVALID_INPUT", "格式：信仰 打开 [物品名] [数量/全部]");
    const last = args[args.length - 1], all = /^(all|全部)$/i.test(last), hasCount = /^\d+$/.test(last);
    const item = (all || hasCount ? args.slice(0, -1) : args).join(" ").trim();
    const quantity = hasCount ? Number(last) : 1;
    if (!item || !Number.isSafeInteger(quantity) || quantity < 1)
        throw new BusinessError("INVALID_INPUT", "格式：信仰 打开 [物品名] [数量/全部]");
    return {
        item, quantity, all
    };
}
function emptyResult() {
    return { currencies: {
            gold: 0, ascension_score: 0, audience_score: 0
        }, items: {} as Record<string, number> };
}
function merge(target: ReturnType<typeof emptyResult>, value: FaithOpenResult) {
    for (const key of Object.keys(target.currencies) as (keyof typeof target.currencies)[])
        target.currencies[key] += value.currencies[key];
    for (const [id, count] of Object.entries(value.items))
        target.items[id] = (target.items[id] ?? 0) + count;
}
