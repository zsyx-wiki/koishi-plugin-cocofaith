import { BINDING_CONFIG } from "./modules/binding/config";
import { CLUB_CONFIG } from "./modules/club/config";
import { CONTAINER_CONFIG } from "./modules/container/config";
import { DAILY_PRAYER_CONFIG } from "./modules/daily-prayer/config";
import { FAITH_CONFIG } from "./modules/faith/config";
import { JUNK_CONFIG } from "./modules/junk/config";
import { ROULETTE_CONFIG } from "./modules/roulette/config";
import { VOID_PRAYER_CONFIG } from "./modules/void-prayer/config";
export const BUILT_IN_CONFIGS = {
    faith: {
        module: "faith", description: "信仰基础", definition: FAITH_CONFIG
    },
    dailyPrayer: {
        module: "daily_prayer", description: "每日祈祷", definition: DAILY_PRAYER_CONFIG
    },
    junk: {
        module: "junk", description: "捡垃圾", definition: JUNK_CONFIG
    },
    roulette: {
        module: "roulette", description: "恶魔轮盘", definition: ROULETTE_CONFIG
    },
    binding: {
        module: "binding", description: "平台身份绑定", definition: BINDING_CONFIG
    },
    club: {
        module: "club", description: "椰汁俱乐部", definition: CLUB_CONFIG
    },
    voidPrayer: {
        module: "void_prayer", description: "虚空祈求", definition: VOID_PRAYER_CONFIG
    },
    container: {
        module: "container", description: "神性容器", definition: CONTAINER_CONFIG
    },
} as const;
