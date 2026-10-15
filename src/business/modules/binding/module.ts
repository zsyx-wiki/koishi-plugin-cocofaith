import { provideGameplayInterface } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { defineAdvancedGameplay } from "../../framework/types";
import { BINDING_API } from "../../shared/contracts";
import { MESSAGES } from "../../shared/messages";
import { BINDING_CONFIG, type BindingConfig } from "./config";
import { BindingService } from "./service";
export function createBindingModule() {
    let service: BindingService;
    return defineAdvancedGameplay<never, never, BindingConfig>({
        name: "binding",
        config: BINDING_CONFIG,
        init(ctx) {
            service = new BindingService(ctx.core, ctx.config);
            provideGameplayInterface(ctx, BINDING_API, Object.freeze({ userInfo: service.userInfo.bind(service) }), { version: "1.0.0" });
        },
        reload(ctx) {
            service.configure(ctx.config);
        },
        dispose() {
            service.dispose();
        },
        commands: [{
                id: "coconut_water",
                triggers: ["椰子水"],
                description: "查看身份或关联 OneBot QQ",
                guest: true,
                run() {
                    return { type: "text", content: MESSAGES.binding.help };
                },
                children: [
                    {
                        id: "request_link",
                        triggers: ["申请绑定"],
                        guest: true,
                        async run(ctx) {
                            if (ctx.event.identity?.adapter === "onebot") {
                                if (ctx.args.length)
                                    throw new BusinessError("INVALID_INPUT", "格式：椰子水 申请绑定");
                                const result = await service.issue(ctx.event);
                                if (result.kind === "already-bound")
                                    return { type: "text", content: MESSAGES.binding.alreadyBound(result.uid) };
                                return { type: "text", content: MESSAGES.binding.tokenA(result.tokenA, result.expiresIn) };
                            }
                            if (ctx.args.length !== 1)
                                throw new BusinessError("INVALID_INPUT", "格式：椰子水 申请绑定 [TokenA]");
                            const result = await service.claim(ctx.event, ctx.args[0]);
                            if (result.kind === "already-bound")
                                return { type: "text", content: MESSAGES.binding.alreadyBound(result.uid) };
                            return { type: "text", content: MESSAGES.binding.claimed(result.qq) };
                        },
                    },
                    {
                        id: "confirm_link",
                        triggers: ["确认绑定"],
                        guest: true,
                        async run(ctx) {
                            if (ctx.args.length !== 1)
                                throw new BusinessError("INVALID_INPUT", "格式：椰子水 确认绑定 [TokenB]");
                            const result = await service.confirm(ctx.event, ctx.args[0]);
                            return { type: "text", content: MESSAGES.binding.completed(result.uid, result.qq) };
                        },
                    },
                    {
                        id: "user_info",
                        triggers: ["用户信息"],
                        guest: true,
                        async run(ctx) {
                            if (ctx.args.length)
                                throw new BusinessError("INVALID_INPUT", "格式：椰子水 用户信息");
                            const result = await service.userInfo(ctx.event);
                            return { type: "text", content: MESSAGES.binding.info(result.adapter, result.uid, result.qqAccounts) };
                        },
                    },
                ],
            }],
    });
}
export const bindingModule = createBindingModule();
