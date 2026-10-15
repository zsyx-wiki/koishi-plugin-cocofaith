import { ABOUT_MESSAGES } from "./messages";
import { defineBuiltInGameplay } from "../../framework/built-in";
import { defineGameplay } from "cocofaith-sdk/gameplay";
import { version as koishiVersion } from "koishi";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { COCOFAITH_BUSINESS_VERSION } from "../../version";
export function createAboutGameplay() {
  return defineGameplay({
    name: "about",
    commands: {
      about: {
        triggers: ["关于椰子水"],
        description: "查看 CoCoFaith 与接入端版本",
        guest: true,
        run({ event }) {
          const adapter = event.adapter
            ? `${event.adapter.name} v${event.adapter.version}`
            : `${event.identity?.adapter ?? "未知"}（版本未知）`;
          return ABOUT_MESSAGES(koishiVersion, COCOFAITH_BUSINESS_VERSION, adapter);
        },
      },
    },
  });
}
export function createAboutModule() {
  return adaptGameplayDefinition(createAboutGameplay());
}
export const aboutModule = createAboutModule();

export default defineBuiltInGameplay({
  name: "about",
  description: "关于椰子水",
  order: 80,
  create: createAboutModule,
});
