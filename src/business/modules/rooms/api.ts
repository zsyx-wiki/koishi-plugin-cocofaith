import type { FaithAtomicScope, FaithMoney } from "cocofaith-sdk/core";
import type { BusinessEvent } from "cocofaith-sdk/protocol";
import type { GameplayResult as BusinessResult } from "cocofaith-sdk/gameplay";
export interface RoomMember {
  uid: number;
  name: string;
  ticket: FaithMoney;
}
export interface GameRoom<S extends object = object> {
  id: string;
  key: string;
  owner: string;
  creator: number;
  status: "waiting" | "playing" | "ended";
  version: number;
  min: number;
  max: number;
  members: RoomMember[];
  state: S;
  deadline: number;
  createdAt: number;
  seen: string[];
  log: string[];
}
export interface RoomPlayerTransaction {
  user: FaithAtomicScope["users"];
  economy: FaithAtomicScope["economy"];
  items: FaithAtomicScope["items"];
  progress<T extends Record<string, unknown>>(initial: T): Promise<T>;
  saveProgress(value: Record<string, unknown>): Promise<void>;
}
export interface RoomTransaction {
  player(uid: number): RoomPlayerTransaction;
}
export interface RoomRenderContext {
  action: string;
  uid?: number;
}
export interface RoomGame<S extends object = object> {
  id: string;
  start(room: GameRoom<S>, tx: RoomTransaction): Promise<void>;
  action(
    room: GameRoom<S>,
    uid: number,
    action: string,
    args: readonly string[],
    tx: RoomTransaction,
  ): Promise<void>;
  timeout(room: GameRoom<S>, tx: RoomTransaction): Promise<void>;
  finish(room: GameRoom<S>, tx: RoomTransaction, aborted: boolean): Promise<void>;
  render(room: Readonly<GameRoom<S>>, context?: RoomRenderContext): BusinessResult;
  afterCommit?(room: Readonly<GameRoom<S>>): Promise<void>;
  announcement?(room: Readonly<GameRoom<S>>): BusinessResult["broadcast"];
}
export interface ProgressUpdateOptions {
  source?: string;
  idempotencyKey?: string;
}
export interface CreateRoom<S extends object> {
  min: number;
  max: number;
  state: S;
}
export type RoomEvent = Readonly<BusinessEvent>;

import type { GameplayResult } from "cocofaith-sdk/gameplay";
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
