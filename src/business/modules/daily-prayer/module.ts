import { DAILY_PRAYER_MESSAGES } from "./messages";
import type { BusinessCommandContext } from "../../framework/types";
import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import { provideGameplayInterface, useGameplayInterface } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { defineAdvancedGameplay, type BusinessResult } from "../../framework/types";
import { ADMIN_FIELDS_API, DAILY_PRAYER_API } from "../../shared/contracts";
import { DAILY_PRAYER_CONFIG } from "./config";
import { DailyPrayerService } from "./service";
import type { DailyPrayerConfig, DailyPrayerResult } from "./types";
export function createDailyPrayerModule() {
  let service: DailyPrayerService;
  let matchesPrayer = (_word: string) => false;
  async function handlePray(
    ctx: BusinessCommandContext<DailyPrayerConfig>,
  ): Promise<BusinessResult> {
    if (ctx.uid === null) throw new BusinessError("UNREGISTERED");
    const faith = ctx.core.faiths.resolvePrayerWord(ctx.event.content);
    if (!faith) throw new BusinessError("NOT_FOUND", "这段祷词没有对应的信仰。");
    const result = await service.pray(ctx.uid, faith.name, faith.deity_name ?? faith.name);
    await ctx.core.hooks.emit("completed", result);
    return { type: "text", content: formatResult(result) };
  }
  return defineAdvancedGameplay<never, never, DailyPrayerConfig>({
    name: "daily_prayer",
    dependencies: ["faith", "faith_admin"],
    config: DAILY_PRAYER_CONFIG,
    init(context) {
      service = new DailyPrayerService(context.core, context.config);
      matchesPrayer = (word) => !!context.core.faiths.resolvePrayerWord(word);
      const admin = useGameplayInterface(context, ADMIN_FIELDS_API);
      context.core.lifecycle.track(
        admin.register({
          name: "永久祈祷",
          description: "永久增加每日祈祷上限",
          async change({ targetUid, delta, operationId }) {
            const after = await service.adjust(targetUid, "permanentExtra", delta, operationId);
            return DAILY_PRAYER_MESSAGES.adjusted(targetUid, "永久祈祷次数", delta, after);
          },
        }),
      );
      context.core.lifecycle.track(
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
    },
    reload(context) {
      service = new DailyPrayerService(context.core, context.config);
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
