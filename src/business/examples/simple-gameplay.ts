import { defineBuiltInGameplay } from "../framework/built-in";
import { adaptGameplayDefinition } from "../framework/gameplay-adapter";
import {
  defineGameplay,
  defineGameplayConfig,
  defineGameplayState,
  fail,
  gameplayInteger,
  gameplayString,
  type GameplayAtomicCommandContext,
} from "cocofaith-sdk/gameplay";

const config = defineGameplayConfig({
  rewardGold: gameplayInteger(50, {
    min: 0,
    max: 1000000,
    description: "每日摸鱼金币奖励。",
  }),
});

const state = defineGameplayState({
  fields: { date: gameplayString("") },
});

type FishingContext = GameplayAtomicCommandContext<
  ReturnType<typeof config.parse>,
  undefined,
  ReturnType<typeof state.parse>
>;

async function fish({ state, economy, config }: FishingContext) {
  if (state.data.date === state.gameDay) {
    fail("LIMIT_REACHED", "今天已经摸过鱼了。");
  }

  const reward = await economy.reward({ gold: config.rewardGold });
  state.data.date = state.gameDay;
  return `摸鱼成功，获得 ${reward.applied.gold ?? 0} 金币。`;
}

export const simpleGameplayExample = defineGameplay({
  name: "daily_fish_example",
  config,
  state,
  commands: {
    play: {
      triggers: ["摸鱼", "每日摸鱼"],
      scenes: ["group"],
      atomic: "user",
      run: fish,
    },
  },
});

export default defineBuiltInGameplay({
  name: "daily_fish_example",
  description: "每日摸鱼",
  config: { key: "dailyFishExample", definition: config },
  create: () => adaptGameplayDefinition(simpleGameplayExample),
});
