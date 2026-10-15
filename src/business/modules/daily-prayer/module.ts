import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import {
  defineGameplay,
  provideGameplayInterface,
  useGameplayInterface,
  type GameplayCommandContext,
} from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { ADMIN_FIELDS_API, DAILY_PRAYER_API } from "../../shared/contracts";
import { DAILY_PRAYER_CONFIG } from "./config";
import { DAILY_PRAYER_MESSAGES } from "./messages";
import { DailyPrayerService } from "./service";
import type { DailyPrayerConfig, DailyPrayerResult } from "./types";
type Context = GameplayCommandContext<DailyPrayerConfig, DailyPrayerService>;

async function handlePray(ctx: Context): Promise<GameplayOutput> {
  const faith = ctx.core.faiths.resolvePrayerWord(ctx.event.content);
  if (!faith) throw new BusinessError("NOT_FOUND", "这段祷词没有对应的信仰。");
  const result = await ctx.service.pray(ctx.uid, faith.name, faith.deity_name ?? faith.name);
  await ctx.core.hooks.emit("completed", result);
  return { type: "text", content: formatResult(result) };
}

export function createDailyPrayerGameplay() {
  let matchesPrayer = (_word: string) => false;
  return defineGameplay({
    name: "daily_prayer",
    dependencies: ["faith", "faith_admin"],
    config: DAILY_PRAYER_CONFIG,
    setup(context) {
      const service = new DailyPrayerService(context.core, context.config);
      matchesPrayer = (word) => !!context.core.faiths.resolvePrayerWord(word);
      const admin = useGameplayInterface(context, ADMIN_FIELDS_API);
      context.track(
        admin.register({
          name: "永久祈祷",
          description: "永久增加每日祈祷上限",
          async change({ targetUid, delta, operationId }) {
            const after = await service.adjust(targetUid, "permanentExtra", delta, operationId);
            return DAILY_PRAYER_MESSAGES.adjusted(targetUid, "永久祈祷次数", delta, after);
          },
        }),
      );
      context.track(
        admin.register({
          name: "临时祈祷",
          description: "仅当前游戏日有效的额外祈祷次数",
          async change({ targetUid, delta, operationId }) {
            const after = await service.adjust(targetUid, "temporaryExtra", delta, operationId);
            return DAILY_PRAYER_MESSAGES.adjusted(targetUid, "临时祈祷次数", delta, after);
          },
        }),
      );
      provideGameplayInterface(
        context,
        DAILY_PRAYER_API,
        Object.freeze({ status: (uid: number) => service.status(uid) }),
        { version: "1.0.0" },
      );

      return service;
    },
    reload(service, config) {
      service.configure(config);
    },
    commands: {
      pray: {
        triggers: [],
        match: (content) => matchesPrayer(content),
        description: "当前信仰每日祈祷",
        scenes: ["group"],
        run: handlePray,
      },
    },
  });
}

export function createDailyPrayerModule() {
  return adaptGameplayDefinition(createDailyPrayerGameplay());
}
export const dailyPrayerModule = createDailyPrayerModule();
function formatResult(result: DailyPrayerResult) {
  return DAILY_PRAYER_MESSAGES.result(
    result.god,
    result.reward.ascension_score,
    result.reward.gold,
    result.count,
    result.limit,
  );
}
