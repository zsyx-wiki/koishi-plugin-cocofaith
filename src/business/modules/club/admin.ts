import type { GameplaySetupContext } from "cocofaith-sdk/gameplay";
import { useGameplayInterface } from "cocofaith-sdk/gameplay";
import { ADMIN_COMMANDS_API, ADMIN_FIELDS_API } from "../../contracts/tokens";
import { BusinessError } from "../../framework/errors";
import type { ClubConfig } from "./config";
import type { ClubService } from "./service";
import { CLUB_MESSAGES } from "./messages";
import { parseCurrency } from "./commands";
export function registerClubAdmin(context: GameplaySetupContext<ClubConfig>, service: ClubService) {
  const fields = useGameplayInterface(context, ADMIN_FIELDS_API);
  const definitions = [
    ["俱乐部缴费次数", "feeCount"],
    ["俱乐部金币贡献", "goldContribution"],
    ["俱乐部登神贡献", "ascensionContribution"],
  ] as const;
  for (const [name, field] of definitions)
    context.track(
      fields.register({
        name,
        description: "只修改会员累计数据，不改变贡献池。",
        async change(operation) {
          const result = await service.adjustStats(
            operation.targetUid,
            field,
            operation.delta,
            operation.operationId,
          );
          return CLUB_MESSAGES.statsChanged(operation.targetUid, name, result.stats[field]);
        },
      }),
    );
  const admin = useGameplayInterface(context, ADMIN_COMMANDS_API);
  context.track(
    admin.register({
      business: "club",
      command: "俱乐部",
      description: "执行分成或调整贡献池",
      async execute({ actorUid, args, requestId }) {
        if (args[0] === "分成" && args.length === 1) {
          const result = await service.distribute(actorUid, requestId ?? `${Date.now()}`);
          return {
            type: "text",
            content: CLUB_MESSAGES.distributed(result.paid, result.gold, result.ascension),
          };
        }
        if (args[0] === "总贡献" && args.length === 2) {
          const delta = Number(args[1]);
          const result = await service.adjustPoolBoth(actorUid, delta, requestId);
          return {
            type: "text",
            content: CLUB_MESSAGES.poolChanged(result.gold, result.ascension),
          };
        }
        if (args[0] === "总贡献" && args.length === 3) {
          const currency = parseCurrency(args[1]),
            delta = Number(args[2]);
          const result = await service.adjustPool(actorUid, currency, delta, requestId);
          return {
            type: "text",
            content: CLUB_MESSAGES.poolChanged(result.gold, result.ascension),
          };
        }
        throw new BusinessError(
          "INVALID_INPUT",
          "格式：信仰管理 俱乐部 分成\n信仰管理 俱乐部 总贡献 [+/-数值]\n信仰管理 俱乐部 总贡献 [金币|登神分] [+/-数值]",
        );
      },
    }),
  );
}
