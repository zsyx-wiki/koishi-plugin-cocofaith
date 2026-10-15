import type { FaithCoreUserData, FaithProfessionDefinition } from "cocofaith-sdk/core";
export const FAITH_MESSAGES = Object.freeze({
    help: "信仰 信息\n信仰 注册 [信仰名]\n信仰 弃誓 [目标信仰]\n信仰 职业 [职业名]\n信仰 变更职业 [职业名]\n信仰 职业查看 [信仰名]\n信仰 卖出 [物品名] [数量/全部]\n信仰 打开 [物品名] [数量/全部]",
    registered: (faith: string, gold: number) => `你已信仰【${faith}】！初始获得 ${gold} 金币。`,
    abandoned: (oldFaith: string, newFaith: string, ascension: number, audience: number) => `你已弃誓【${oldFaith}】，转而信仰【${newFaith}】。\n消耗：${ascension} 登神分、${audience} 觐见分。`,
    currentProfession: (type: string, name: string) => `你当前的职业是【${type} - ${name}】。如需更换，请使用“信仰 变更职业 [职业名]”。`,
    professionChoices: (faith: string, choices: readonly {
        type: string;
        name: string;
    }[]) => choices.length ? `【${faith}】可选职业：\n${choices.map((item) => `${item.type}：${item.name}`).join("\n")}` : `【${faith}】暂无可选职业。`,
    professionChosen: (type: string, name: string) => `选择成功！你现在的职业是【${type} - ${name}】。`,
    professionChanged: (oldName: string, type: string, name: string, gold: number, ascension: number) => `付出 ${gold} 金币和 ${ascension} 登神分后，职业从【${oldName}】变更为【${type} - ${name}】。`,
    sold: (item: string, quantity: number, gold: number) => `已出售${item}×${quantity}｜金币 +${gold}`,
    soldLevel: (level: string, kinds: number, quantity: number, gold: number, keepOne: boolean) => `${level} 级${keepOne ? "出售完成" : "全部出售"}｜${kinds} 种，共 ${quantity} 件｜金币 +${gold}${keepOne ? "\n每种物品已保留 1 件。" : ""}`,
    opened: (item: string, quantity: number, rewards: readonly string[]) => `已打开${item}×${quantity}\n${rewards.join(" · ") || "里面什么也没有。"}`,
    info: (user: FaithCoreUserData, profession?: Readonly<FaithProfessionDefinition>) => [
        `UID：${user.uid}`, `信仰：${user.faiths[0] ?? "无"}`, `弃誓次数：${user.abandon_count}`,
        `职业：${profession ? `${profession.type}-${profession.name}` : "无"}`, `登神分：${user.ascension_score}`,
        `觐见分：${user.audience_score}`, `觐见排名：${user.audience_rank > 0 ? user.audience_rank : "未上榜"}`, `金币：${user.gold}`,
    ].join("\n"),
});
