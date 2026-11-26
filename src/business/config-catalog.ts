// 由 scripts/generate-gameplays.cjs 从各 index.ts 提取配置元数据，不加载玩法工厂。
import { builtInConfigs } from "./framework/built-in";
import { FAITH_CONFIG as faith } from "./modules/faith/config";
import { VOID_PRAYER_CONFIG as void_prayer } from "./modules/void-prayer/config";
import { DAILY_PRAYER_CONFIG as daily_prayer } from "./modules/daily-prayer/config";
import { JUNK_CONFIG as junk } from "./modules/junk/config";
import { ROULETTE_CONFIG as roulette } from "./modules/roulette/config";
import { BINDING_CONFIG as binding } from "./modules/binding/config";
import { CLUB_CONFIG as club } from "./modules/club/config";
import { CONTAINER_CONFIG as container } from "./modules/container/config";

export const BUILT_IN_CONFIGS = builtInConfigs([
  { name: "faith", description: "信仰基础", config: { key: "faith", definition: faith } },
  { name: "void_prayer", description: "虚空祈求", config: { key: "voidPrayer", definition: void_prayer } },
  { name: "daily_prayer", description: "每日祈祷", config: { key: "dailyPrayer", definition: daily_prayer } },
  { name: "junk", description: "捡垃圾", config: { key: "junk", definition: junk } },
  { name: "roulette", description: "恶魔轮盘", config: { key: "roulette", definition: roulette } },
  { name: "binding", description: "平台身份绑定", config: { key: "binding", definition: binding } },
  { name: "club", description: "椰汁俱乐部", config: { key: "club", definition: club } },
  { name: "container", description: "神性容器", config: { key: "container", definition: container } },
] as const);
