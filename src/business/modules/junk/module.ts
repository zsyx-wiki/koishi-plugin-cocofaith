import { defineGameplay, defineGameplayState } from "cocofaith-sdk/gameplay";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { formatItem } from "../../shared/item-format";
import { MESSAGES } from "../../shared/messages";
import { JUNK_CONFIG } from "./config";
import { JunkService } from "./service";
const junkState = defineGameplayState({
    defaults: {
        date: "", freeUsed: false, paidUsed: false
    },
    parse(value) {
        if (!value || typeof value !== "object")
            throw new TypeError("捡垃圾状态必须是对象");
        const data = value as Record<string, unknown>;
        if (typeof data.date !== "string" || typeof data.freeUsed !== "boolean" || typeof data.paidUsed !== "boolean") {
            throw new TypeError("捡垃圾状态字段无效");
        }
        return {
            date: data.date, freeUsed: data.freeUsed, paidUsed: data.paidUsed
        };
    },
});
export function createJunkGameplay() {
    return defineGameplay({
        name: "junk",
        dependencies: ["faith"],
        config: JUNK_CONFIG,
        state: junkState,
        setup({ core, config }) {
            return { picker: new JunkService(core, config), item: (name: string) => core.items.require(name) };
        },
        commands: [{
                id: "junk",
                triggers: ["捡垃圾"],
                scenes: ["group"],
                description: "从虚空中捞取可开启物品",
                atomic: "user",
                async run({ tx, state, service }) {
                    const result = await service.picker.pickInTransaction(tx, state.data, state.gameDay);
                    const counts = new Map<string, number>();
                    for (const name of result.items)
                        counts.set(name, (counts.get(name) ?? 0) + 1);
                    return MESSAGES.junk.result(result.cost, [...counts].map(([name, count]) => `${formatItem(service.item(name))}×${count}`).join("\n"));
                },
            }],
    });
}
export function createJunkModule() {
    return adaptGameplayDefinition(createJunkGameplay());
}
export const junkModule = createJunkModule();
