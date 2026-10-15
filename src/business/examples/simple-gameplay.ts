import { defineGameplay, defineGameplayConfig, fail, gameplayInteger, } from "cocofaith-sdk/gameplay";
const config = defineGameplayConfig({
    rewardGold: gameplayInteger(50, {
        min: 0,
        max: 1000000,
        description: "每日摸鱼金币奖励。",
    }),
});
export const simpleGameplayExample = defineGameplay({
    name: "daily_fish_example",
    config,
    setup({ config: current }) {
        return {
            rewardLabel: `${current.rewardGold} 金币`,
        };
    },
    commands: [
        {
            id: "play",
            triggers: ["摸鱼", "每日摸鱼"],
            scenes: ["group"],
            atomic: "user",
            async run({ state, economy, config: current, service }) {
                if (state.data.date === state.gameDay) {
                    fail("LIMIT_REACHED", "今天已经摸过鱼了。");
                }
                const reward = await economy.reward({
                    gold: current.rewardGold,
                });
                state.data.date = state.gameDay;
                return `摸鱼成功，获得 ${reward.applied.gold ?? 0} 金币（${service.rewardLabel}）。`;
            },
        },
    ],
});
