import { VOID_PRAYER_MESSAGES } from "./messages";
import type { BusinessCommandContext } from "../../framework/types";
import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import { provideGameplayInterface, useGameplayInterface } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { defineAdvancedGameplay, type BusinessResult } from "../../framework/types";
import { ADMIN_FIELDS_API, VOID_PRAYER_API } from "../../shared/contracts";
import { formatItem } from "../../shared/item-format";
import type { FaithAdminNumericFieldsApi } from "../faith-admin";
import { VOID_PRAYER_CONFIG } from "./config";
import { VoidPrayerService, type VoidPrayerAdjustment } from "./service";
import { type VoidPrayerConfig, type VoidPrayerResult } from "./types";
export function createVoidPrayerModule() {
  let service: VoidPrayerService;
  async function handleVoidPrayer(
    ctx: BusinessCommandContext<VoidPrayerConfig>,
  ): Promise<BusinessResult> {
    if (ctx.uid === null) throw new BusinessError("UNREGISTERED");
    const count = parseCount(ctx.args);
    const result = await service.pray(ctx.uid, count);
    await ctx.core.hooks.emit(
      "completed",
      Object.freeze({
        uid: ctx.uid,
        date: result.date,
        cost: result.cost,
        counts: result.counts,
        spItems: result.draws
          .filter((draw) => draw.item.level === "SP")
          .map((draw) => draw.item.name),
      }),
    );
    return { type: "text", content: formatResult(result, ctx.core.items.levels.compare) };
  }
  async function handleVoidPrayerStatus(
    ctx: BusinessCommandContext<VoidPrayerConfig>,
  ): Promise<GameplayOutput> {
    if (ctx.uid === null) throw new BusinessError("UNREGISTERED");
    const value = await service.status(ctx.uid);
    return {
      type: "text",
      content: VOID_PRAYER_MESSAGES.status(
        value.dailyUsed,
        value.dailyLimit,
        value.remaining,
        value.consumableExtra,
        value.costReduction,
      ),
    };
  }
  return defineAdvancedGameplay<never, never, VoidPrayerConfig>({
    name: "void_prayer",
    dependencies: ["faith", "faith_admin"],
    config: VOID_PRAYER_CONFIG,
    init(context) {
      service = new VoidPrayerService(context.core, context.config);
      const admin = useGameplayInterface(context, ADMIN_FIELDS_API);
      registerAdminField(
        admin,
        context,
        service,
        "奖励祈求",
        "consumableExtra",
        "可在每日次数耗尽后使用的额外祈求次数",
      );
      registerAdminField(
        admin,
        context,
        service,
        "祈求上限",
        "permanentExtra",
        "永久增加每日虚空祈求上限",
      );
      registerAdminField(
        admin,
        context,
        service,
        "额外祈求",
        "temporaryExtra",
        "仅当前游戏日有效的额外祈求次数",
      );
      provideGameplayInterface(
        context,
        VOID_PRAYER_API,
        Object.freeze({ status: (uid: number) => service.status(uid) }),
        { version: "1.0.0" },
      );
    },
    reload(context) {
      service = new VoidPrayerService(context.core, context.config);
    },
    commands: {
      void_prayer: {
        triggers: ["虚空祈求"],
        description: "消耗金币从虚空中获取物品",
        scenes: ["group"],
        run: handleVoidPrayer,
        children: {
          status: {
            triggers: ["次数", "状态"],
            scenes: ["group"],
            run: handleVoidPrayerStatus,
          },
        },
      },
    },
  });
}
export const voidPrayerModule = createVoidPrayerModule();
function parseCount(args: readonly string[]) {
  if (!args.length) return 1;
  if (args.length !== 1 || !/^\d+$/.test(args[0]))
    throw new BusinessError("INVALID_INPUT", "格式：虚空祈求 [次数]");
  return Number(args[0]);
}
function formatResult(result: VoidPrayerResult, compare: (a: string, b: string) => number) {
  const levels = Object.keys(result.counts)
    .sort((a, b) => compare(b, a))
    .map((level) => `${level}×${result.counts[level]}`)
    .join(" · ");
  const top = [...result.draws].sort((a, b) => compare(b.item.level, a.item.level)).slice(0, 5);
  return VOID_PRAYER_MESSAGES.result(
    result.actual,
    result.requested,
    result.cost,
    levels,
    top.map((draw) => formatItem(draw.item)).join("\n"),
    result.used,
    result.dailyLimit,
    result.remaining,
  );
}
function registerAdminField(
  admin: FaithAdminNumericFieldsApi,
  context: Parameters<NonNullable<ReturnType<typeof defineAdvancedGameplay>["init"]>>[0],
  service: VoidPrayerService,
  name: string,
  field: VoidPrayerAdjustment,
  description: string,
) {
  context.core.lifecycle.track(
    admin.register({
      name,
      description,
      async change({ targetUid, delta, operationId }) {
        const after = await service.adjust(targetUid, field, delta, operationId);
        return VOID_PRAYER_MESSAGES.adjusted(targetUid, name, delta, after);
      },
    }),
  );
}
