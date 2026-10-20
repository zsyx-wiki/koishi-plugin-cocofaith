import { useGameplayInterface, type GameplaySetupContext } from "cocofaith-sdk/gameplay";
import {
  DAILY_PRAYER_API, VOID_PRAYER_API, CLUB_API, BINDING_API, COLLECTION_API, ROOMS_API, ROULETTE_API,
  type DailyPrayerApi, type VoidPrayerApi, type ClubApi, type BindingApi,
  type CollectionApi, type GameRoomsApi, type RouletteGameplayApi,
} from "../../src/business";

declare const context: GameplaySetupContext<Record<string, never>>;
const daily: DailyPrayerApi = useGameplayInterface(context, DAILY_PRAYER_API);
const prayer: VoidPrayerApi = useGameplayInterface(context, VOID_PRAYER_API);
const club: ClubApi = useGameplayInterface(context, CLUB_API);
const binding: BindingApi = useGameplayInterface(context, BINDING_API);
const collection: CollectionApi = useGameplayInterface(context, COLLECTION_API);
const rooms: GameRoomsApi = useGameplayInterface(context, ROOMS_API);
const roulette: RouletteGameplayApi = useGameplayInterface(context, ROULETTE_API);
async function consume() {
  const limit: number = (await daily.status(10000000)).limit;
  const remaining: number = (await prayer.status(10000000)).remaining;
  const total: number = (await collection.details(10000000)).total;
  const progress = await rooms.updateProgress(10000000, "example", { count: 1 }, value => ++value.count);
  const numeric: number = progress;
  const honor: number = await roulette.changeHonor(10000000, 1);
  // @ts-expect-error Internal service configuration is not a public gameplay API.
  daily.configure({});
  // @ts-expect-error Private binding tokens must never become part of the public interface.
  binding.issueTokenA({});
  // @ts-expect-error Club maintenance is internal to its lifecycle.
  club.renewAll("2026-10-20");
  return { limit, remaining, total, numeric, honor };
}
