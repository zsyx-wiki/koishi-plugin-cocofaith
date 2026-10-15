import type { InventoryMutation } from "cocofaith-sdk/core";
import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import {
  defineGameplay,
  provideGameplayInterface,
  useGameplayInterface,
  type GameplayCommandContext,
} from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { ADMIN_COMMANDS_API, COLLECTION_API, TITLE_API } from "../../shared/contracts";
import type { CollectionRule } from "./catalog";
import { COLLECTION_MESSAGES } from "./messages";
import { CollectionService } from "./service";
export interface CollectionApi {
  state: CollectionService["state"];
  has: CollectionService["has"];
  progress: CollectionService["progress"];
  details: CollectionService["details"];
  refresh: CollectionService["refresh"];
  configure(itemId: string, rule: CollectionRule): () => void;
}
type Context = GameplayCommandContext<Record<string, never>, CollectionService>;

const details = (limited: boolean) => async (ctx: Context) => {
  if (ctx.args.length > 1 || (ctx.args[0] !== undefined && !/^[1-9]\d*$/.test(ctx.args[0])))
    throw new BusinessError("INVALID_INPUT", "格式：图鉴 详情/限定详情 [页码]");
  const user = ctx.uid;
  await ctx.service.refresh(user);
  const result = await ctx.service.details(user, limited, Number(ctx.args[0] ?? 1));
  return {
    type: "text" as const,
    content: COLLECTION_MESSAGES.page(
      limited,
      result.page,
      result.pages,
      result.entries.map(
        (e) =>
          `${e.collected ? "✓" : "○"} [${e.item.level === "??" ? "彩蛋" : e.item.level}] ${e.item.name}${e.pool ? `（${e.pool}）` : ""}`,
      ),
    ),
  };
};

async function handleCollectionView(ctx: Context): Promise<GameplayOutput> {
  const user = ctx.uid;
  await ctx.service.refresh(user);
  const rows = await ctx.service.progress(user);
  return {
    type: "text",
    content: COLLECTION_MESSAGES.progress(
      rows.map((r) => `${r.pool || "常规"}·${r.category}：${r.collected}/${r.total}`),
    ),
  };
}

export function createCollectionGameplay() {
  return defineGameplay({
    name: "collection",
    dependencies: ["title", "faith_admin"],
    setup(ctx) {
      ctx.core.registerTable(
        {
          uid: "unsigned",
          items: "json",
          updated_at: "timestamp",
        },
        { primary: "uid" },
      );
      const service = new CollectionService(ctx.core, useGameplayInterface(ctx, TITLE_API));
      provideGameplayInterface(
        ctx,
        COLLECTION_API,
        Object.freeze({
          state: service.state.bind(service),
          has: service.has.bind(service),
          progress: service.progress.bind(service),
          details: service.details.bind(service),
          refresh: service.refresh.bind(service),
          configure: (itemId: string, rule: CollectionRule) =>
            service.catalog.configure(itemId, rule),
        }),
      );
      ctx.track(
        ctx.core.hooks.on<InventoryMutation>(
          "inventory/changed",
          async (event) => {
            if (event.delta > 0) await service.record(event.uid, [event.item_id]);
          },
          { id: "collection-inventory", timeout: 0 },
        ),
      );
      ctx.track(
        useGameplayInterface(ctx, ADMIN_COMMANDS_API).register({
          business: "collection",
          command: "图鉴",
          description: "根据背包刷新图鉴",
          async execute({ args, core }) {
            if (args.length === 1 && args[0] === "全量刷新") {
              const result = await service.refreshAll();
              return {
                type: "text",
                content: COLLECTION_MESSAGES.refreshed(result.checked, result.added, result.failed),
              };
            }
            if (args.length === 2 && args[0] === "刷新") {
              const uid = Number(args[1]);
              if (!Number.isSafeInteger(uid))
                throw new BusinessError("INVALID_INPUT", "UID 格式无效。");
              await core.users.require(uid);
              const added = await service.refresh(uid);
              return { type: "text", content: COLLECTION_MESSAGES.refreshedOne(uid, added) };
            }
            throw new BusinessError(
              "INVALID_INPUT",
              "格式：信仰管理 图鉴 全量刷新\n指定用户：信仰管理 图鉴 刷新 [uid]",
            );
          },
        }),
      );

      return service;
    },
    commands: {
      collection: {
        triggers: ["图鉴"],
        description: "查看收藏图鉴",
        run() {
          return { type: "text", content: COLLECTION_MESSAGES.help };
        },
        children: {
          view: {
            triggers: ["查看"],
            run: handleCollectionView,
          },
          details: {
            triggers: ["详情"],
            run: details(false),
          },
          limited: {
            triggers: ["限定详情"],
            run: details(true),
          },
        },
      },
    },
    reload() {},
  });
}

export function createCollectionModule() {
  return adaptGameplayDefinition(createCollectionGameplay());
}
