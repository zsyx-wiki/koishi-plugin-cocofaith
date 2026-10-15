import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import {
  defineGameplay,
  provideGameplayInterface,
  useGameplayInterface,
  type GameplayCommandContext,
  type GameplaySetupContext,
} from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { ADMIN_FIELDS_API, VOID_PRAYER_API } from "../../shared/contracts";
import { formatItem } from "../../shared/item-format";
import type { FaithAdminNumericFieldsApi } from "../faith-admin";
import { VOID_PRAYER_CONFIG } from "./config";
import { VOID_PRAYER_MESSAGES } from "./messages";
import { VoidPrayerService, type VoidPrayerAdjustment } from "./service";
import { type VoidPrayerConfig, type VoidPrayerResult } from "./types";
type Context = GameplayCommandContext<VoidPrayerConfig, VoidPrayerService>;

async function handleVoidPrayer(ctx: Context): Promise<GameplayOutput> {
  const count = parseCount(ctx.args);
  const result = await ctx.service.pray(ctx.uid, count);
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

async function handleVoidPrayerStatus(ctx: Context): Promise<GameplayOutput> {
  const value = await ctx.service.status(ctx.uid);
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

export function createVoidPrayerGameplay() {
  return defineGameplay({
    name: "void_prayer",
    dependencies: ["faith", "faith_admin"],
    config: VOID_PRAYER_CONFIG,
    setup(context) {
      const service = new VoidPrayerService(context.core, context.config);
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

      return service;
    },
    reload(service, config) {
      service.configure(config);
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

export function createVoidPrayerModule() {
  return adaptGameplayDefinition(createVoidPrayerGameplay());
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
  context: GameplaySetupContext<VoidPrayerConfig>,
  service: VoidPrayerService,
  name: string,
  field: VoidPrayerAdjustment,
  description: string,
) {
  context.track(
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
