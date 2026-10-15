import type { FaithItemDefinition } from "cocofaith-sdk/core";
export function formatItem(item: Pick<FaithItemDefinition, "name" | "level">) {
    return `【${item.level}｜${item.name}】`;
}
