export const ROULETTE_MESSAGES = Object.freeze({
    help: "恶魔轮盘\n发起 / 发起赌徒 / 发起疯狂\n加入 / 退出 / 开始 / 结束\n开枪 / 恐惧 / 无畏 / 退缩\n对局 / 状态 / 强制结束\n超时45秒自动开枪，累计第二次超时淘汰。QQ消息无法发送时对局仍继续。",
    stats: (s: {
        level: number;
        exp: number;
        honor: number;
        plays: number;
        normal: {
            wins: number;
            plays: number;
        };
        gambler: {
            wins: number;
            plays: number;
        };
        crazy: {
            wins: number;
            plays: number;
        };
    }) => `轮盘等级：${s.level}\n经验：${s.exp}\n荣誉：${s.honor}\n总场次：${s.plays}\n普通：${s.normal.wins}/${s.normal.plays}胜\n赌徒：${s.gambler.wins}/${s.gambler.plays}胜\n疯狂：${s.crazy.wins}/${s.crazy.plays}胜`,
    started: (bullets: number, empties: number) => `赌局正式开始！左轮已装填 ${bullets} 颗实弹与 ${empties} 颗空仓。`,
    empty: (name: string) => `咔……清脆的空仓声。【${name}】活了下来。`,
    bullet: (name: string) => `砰！子弹击中了【${name}】。`,
    death: (name: string, reason: string) => `【${name}】${reason}，倒下出局。`,
    timeout: (name: string, count: number) => `【${name}】超过45秒未开枪（累计超时 ${count}/2）。`,
    timeoutDeath: (name: string) => `【${name}】累计超时两次，被恶魔拖入深渊。`,
    reload: (bullets: number, empties: number) => `弹仓已空，恶魔重新装填：${bullets} 实弹 / ${empties} 空仓。`,
    noWinner: "所有人都倒下了，没有幸存者。恶魔满意地收走了赌注。",
    winner: (name: string, gold: number, score: number) => `尘埃落定！【${name}】成为最后的幸存者，获得 ${gold} 金币和 ${score} 登神分。`,
    second: (name: string, gold: number, score: number) => `第二名【${name}】获得 ${gold} 金币和 ${score} 登神分。`,
    maxLevel: (names: readonly string[]) => `恶魔轮盘满级\n${names.join("\n")}\n达到10级，获得「恶魔赌徒」称号及满级奖励。`,
    joined: (name: string, count: number, max: number, min: number, creator: string) => `加入成功：${name}\n人数：${count}/${max}（至少${min}人）\n房主：${creator}`,
    waiting: (mode: string, count: number, max: number, min: number, members: readonly string[]) => `恶魔轮盘：${mode}模式\n人数：${count}/${max}（至少${min}人）\n${members.join("\n")}\n发送「恶魔轮盘 加入」，房主发送「恶魔轮盘 开始」。\n等待房间15分钟后自动解散。`,
    active: (parts: readonly (string | false | undefined)[]) => parts.filter(Boolean).join("\n"),
});
export const rouletteText = ROULETTE_MESSAGES;
