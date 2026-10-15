import { ABOUT_MESSAGES } from "../modules/about/messages";
import { BINDING_MESSAGES } from "../modules/binding/messages";
import { CLUB_MESSAGES } from "../modules/club/messages";
import { COLLECTION_MESSAGES } from "../modules/collection/messages";
import { DAILY_PRAYER_MESSAGES } from "../modules/daily-prayer/messages";
import { ADMIN_MESSAGES } from "../modules/faith-admin/messages";
import { FAITH_MESSAGES } from "../modules/faith/messages";
import { JUNK_MESSAGES } from "../modules/junk/messages";
import { ROULETTE_MESSAGES } from "../modules/roulette/messages";
import { TITLE_MESSAGES } from "../modules/title/messages";
import { VOID_PRAYER_MESSAGES } from "../modules/void-prayer/messages";
import { COMMON_MESSAGES } from "./common-messages";
export const MESSAGES = Object.freeze({
    common: COMMON_MESSAGES,
    binding: BINDING_MESSAGES,
    club: CLUB_MESSAGES,
    faith: FAITH_MESSAGES,
    dailyPrayer: DAILY_PRAYER_MESSAGES,
    junk: JUNK_MESSAGES,
    voidPrayer: VOID_PRAYER_MESSAGES,
    title: TITLE_MESSAGES,
    collection: COLLECTION_MESSAGES,
    admin: ADMIN_MESSAGES,
    roulette: ROULETTE_MESSAGES,
    about: ABOUT_MESSAGES,
});
export type FaithMessages = typeof MESSAGES;
