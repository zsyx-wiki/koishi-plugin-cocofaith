import { defineGameplay } from "cocofaith-sdk/gameplay";
import { version as koishiVersion } from "koishi";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { MESSAGES } from "../../shared/messages";
import { COCOFAITH_BUSINESS_VERSION } from "../../version";
export function createAboutGameplay() {
    return defineGameplay({
        name: "about",
        commands: [{
                id: "about",
                triggers: ["关于椰子水"],
                description: "查看 CoCoFaith 与接入端版本",
                guest: true,
                run({ event }) {
                    const adapter = event.adapter
                        ? `${event.adapter.name} v${event.adapter.version}`
                        : `${event.identity?.adapter ?? "未知"}（版本未知）`;
                    return MESSAGES.about(koishiVersion, COCOFAITH_BUSINESS_VERSION, adapter);
                },
            }],
    });
}
export function createAboutModule() {
    return adaptGameplayDefinition(createAboutGameplay());
}
export const aboutModule = createAboutModule();
