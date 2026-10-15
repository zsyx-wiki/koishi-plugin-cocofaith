import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import {
  defineGameplay,
  provideGameplayInterface,
  type GameplayCommandContext,
} from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { BINDING_API } from "../../shared/contracts";
import { BINDING_CONFIG, type BindingConfig } from "./config";
import { BINDING_MESSAGES } from "./messages";
import { BindingService } from "./service";
type Context = GameplayCommandContext<BindingConfig, BindingService, number | null>;

async function handleCoconutWaterRequestLink(ctx: Context): Promise<GameplayOutput> {
  if (ctx.event.identity?.adapter === "onebot") {
    if (ctx.args.length) throw new BusinessError("INVALID_INPUT", "格式：椰子水 申请绑定");
    const result = await ctx.service.issue(ctx.event);
    if (result.kind === "already-bound")
      return { type: "text", content: BINDING_MESSAGES.alreadyBound(result.uid) };
    return { type: "text", content: BINDING_MESSAGES.tokenA(result.tokenA, result.expiresIn) };
  }
  if (ctx.args.length !== 1)
    throw new BusinessError("INVALID_INPUT", "格式：椰子水 申请绑定 [TokenA]");
  const result = await ctx.service.claim(ctx.event, ctx.args[0]);
  if (result.kind === "already-bound")
    return { type: "text", content: BINDING_MESSAGES.alreadyBound(result.uid) };
  return { type: "text", content: BINDING_MESSAGES.claimed(result.qq) };
}

async function handleCoconutWaterConfirmLink(ctx: Context): Promise<GameplayOutput> {
  if (ctx.args.length !== 1)
    throw new BusinessError("INVALID_INPUT", "格式：椰子水 确认绑定 [TokenB]");
  const result = await ctx.service.confirm(ctx.event, ctx.args[0]);
  return { type: "text", content: BINDING_MESSAGES.completed(result.uid, result.qq) };
}

async function handleCoconutWaterUserInfo(ctx: Context): Promise<GameplayOutput> {
  if (ctx.args.length) throw new BusinessError("INVALID_INPUT", "格式：椰子水 用户信息");
  const result = await ctx.service.userInfo(ctx.event);
  return {
    type: "text",
    content: BINDING_MESSAGES.info(result.adapter, result.uid, result.qqAccounts),
  };
}

export function createBindingGameplay() {
  return defineGameplay({
    name: "binding",
    config: BINDING_CONFIG,
    setup(ctx) {
      const service = new BindingService(ctx.core, ctx.config);
      ctx.defer(() => service.dispose());
      provideGameplayInterface(
        ctx,
        BINDING_API,
        Object.freeze({ userInfo: service.userInfo.bind(service) }),
        { version: "1.0.0" },
      );

      return service;
    },
    reload(service, config) {
      service.configure(config);
    },
    commands: {
      coconut_water: {
        triggers: ["椰子水"],
        description: "查看身份或关联 OneBot QQ",
        guest: true,
        run() {
          return { type: "text", content: BINDING_MESSAGES.help };
        },
        children: {
          request_link: {
            triggers: ["申请绑定"],
            guest: true,
            run: handleCoconutWaterRequestLink,
          },
          confirm_link: {
            triggers: ["确认绑定"],
            guest: true,
            run: handleCoconutWaterConfirmLink,
          },
          user_info: {
            triggers: ["用户信息"],
            guest: true,
            run: handleCoconutWaterUserInfo,
          },
        },
      },
    },
  });
}

export function createBindingModule() {
  return adaptGameplayDefinition(createBindingGameplay());
}
export const bindingModule = createBindingModule();
