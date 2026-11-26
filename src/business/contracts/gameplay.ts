/** Stable gameplay APIs. Implementations depend on these contracts, never the reverse. */
import type { GameplayResult } from "cocofaith-sdk/gameplay";
import type { BusinessEvent } from "cocofaith-sdk/protocol";
import type { BindingUserInfo } from "../modules/binding/types";
import type { ClubPool, ClubStatus } from "../modules/club/types";
import type { DailyPrayerState } from "../modules/daily-prayer/types";
import type { VoidPrayerState } from "../modules/void-prayer/types";
import type { CollectionRule } from "../modules/collection/catalog";
import type {
  CollectionState,
  CollectionProgress,
  CollectionPage,
} from "../modules/collection/types";
import type {
  CreateRoom,
  RoomEvent,
  RoomGame,
  ProgressUpdateOptions,
} from "../modules/rooms/types";
import type {
  RouletteRule,
  RoulettePhase,
  RouletteEffectContext,
} from "../modules/roulette/registry";
import type { RouletteStats } from "../modules/roulette/types";

export interface BindingApi {
  userInfo(event: Readonly<BusinessEvent>): Promise<BindingUserInfo>;
}
export interface ClubApi {
  status(uid: number): Promise<ClubStatus | null>;
  pool(): Promise<ClubPool>;
}
export type DailyPrayerStatus = Readonly<DailyPrayerState & { limit: number; remaining: number }>;
export interface DailyPrayerApi {
  status(uid: number): Promise<DailyPrayerStatus>;
}
export type VoidPrayerStatus = Readonly<
  VoidPrayerState & { dailyLimit: number; remaining: number }
>;
export interface VoidPrayerApi {
  status(uid: number): Promise<VoidPrayerStatus>;
}
export interface CollectionApi {
  state(uid: number): Promise<CollectionState>;
  has(uid: number, item: string): Promise<boolean>;
  progress(uid: number): Promise<CollectionProgress[]>;
  details(uid: number, limited?: boolean, page?: number): Promise<CollectionPage>;
  refresh(uid: number): Promise<number>;
  configure(itemId: string, rule: CollectionRule): () => void;
}
export interface GameRoomsApi {
  register(game: RoomGame): { dispose(): Promise<void> };
  create<S extends object>(
    event: RoomEvent,
    owner: string,
    options: CreateRoom<S>,
  ): Promise<GameplayResult>;
  command(
    event: RoomEvent,
    owner: string,
    action: string,
    args?: readonly string[],
  ): Promise<GameplayResult>;
  progress<T extends Record<string, unknown>>(uid: number, game: string, initial: T): Promise<T>;
  updateProgress<T extends Record<string, unknown>, R>(
    uid: number,
    game: string,
    initial: T,
    update: (progress: T) => R | Promise<R>,
    options?: ProgressUpdateOptions,
  ): Promise<R>;
}
export interface RouletteGameplayApi {
  registerPath(rule: RouletteRule): Readonly<RouletteRule>;
  registerField(rule: RouletteRule): Readonly<RouletteRule>;
  registerHook(hook: {
    id: string;
    phase: RoulettePhase;
    priority?: number;
    apply: (context: RouletteEffectContext) => void;
  }): { dispose(): void };
  stats(uid: number): Promise<RouletteStats>;
  changeHonor(uid: number, delta: number, idempotencyKey?: string): Promise<number>;
}
