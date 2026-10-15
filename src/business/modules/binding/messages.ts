export const BINDING_MESSAGES = Object.freeze({
    help: "椰子水 申请绑定\n椰子水 申请绑定 [TokenA]\n椰子水 确认绑定 [TokenB]\n椰子水 用户信息",
    tokenA: (token: string, seconds: number) => `绑定申请已创建。\nTokenA：${token}\n请在 ${seconds} 秒内，使用已注册的 QQ 官方机器人账号在群聊发送：\n椰子水 申请绑定 ${token}`,
    tokenB: (token: string, uid: number, qq: string, seconds: number) => `QQ 官方身份验证已接收。\n目标 UID：${uid}\nOneBot QQ：${qq}\nTokenB：${token}\n请在 ${seconds} 秒内，使用当前 OneBot 私聊发送：\n椰子水 确认绑定 ${token}`,
    claimed: (qq: string) => `已验证 OneBot QQ ${qq} 的申请。TokenB 已发送至该 QQ 的 OneBot 私聊，请使用当前账号完成确认。`,
    completed: (uid: number, qq: string) => `绑定完成。\nUID：${uid}\nOneBot QQ：${qq}`,
    alreadyBound: (uid: number) => `当前 OneBot QQ 已绑定 UID ${uid}。`,
    info: (adapter: string, uid: number | null, qqs: readonly string[]) => [
        `平台：${adapter}`, `UID：${uid ?? "未注册"}`,
        `QQ：${qqs.length ? qqs.join("、") : "未绑定"}`,
    ].join("\n"),
});
