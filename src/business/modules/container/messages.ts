import type { ContainerStatus } from "./types";
export const containerText = {
    help: "容器 查看\n容器 投入 [轮盘赌荣誉|神性碎片] [数量]\n容器 觐献 [次数]\n容器 从神 [神名]\n容器 真神 [神名] [命途] [SP 道具名]",
    notOwned: "你尚未拥有【神性容器】，无法进行此操作。",
    status(value: ContainerStatus, max: number, passiveMax: number, goldRate: number, ascensionRate: number, maxCharges: number) {
        const effective = Math.floor(Math.min(value.state.divinity, passiveMax));
        const identity = value.level === "truegod" ? `真神【${value.state.truegodName ?? "未知"}】` : value.level === "subgod" ? `从神【${value.state.subgodName ?? "未知"}】` : "凡身";
        return [
            `--- 神性容器｜${identity} ---`,
            `神性：${value.state.divinity.toFixed(2)} / ${max}`,
            effective > 0 ? `容器共鸣：金币获取 +${(effective * goldRate * 100).toFixed(2)}%，登神分获取 +${(effective * ascensionRate * 100).toFixed(2)}%` : "容器中的神性尚未形成有效共鸣。",
            `觐献次数：${value.state.consecrationCharges} / ${maxCharges}`,
        ].join("\n");
    },
};
export const containerCustomizationText = {
    prayer: (faith: string, word: string) => `【${faith}】的专属祷词已设为：${word}`,
    profession: (faith: string, type: string, name: string) => `【${faith}】的【${type}】职业已设为【${name}】，信徒可通过“信仰 职业 ${name}”选择。`,
};
