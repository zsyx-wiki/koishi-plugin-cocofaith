import type { FaithLifecycleRegistrationOptions as LifecycleRegistrationOptions } from "cocofaith-sdk/core";
export type {
  FaithDisposable,
  FaithGameDayEvent,
  FaithLifecycleRegistrationOptions as LifecycleRegistrationOptions,
} from "cocofaith-sdk/core";
export type FaithLifecycleStage = "init" | "ready" | "reload" | "game-day" | "dispose";
export type FaithLifecycleState =
  | "created"
  | "initializing"
  | "initialized"
  | "readying"
  | "ready"
  | "reloading"
  | "failed"
  | "disposing"
  | "disposed";
export type FaithLifecycleHandler<T = unknown> = (payload: T) => void | Promise<void>;

export interface LifecycleRegistration extends Required<LifecycleRegistrationOptions> {
  id: number;
  handler: FaithLifecycleHandler;
  active: boolean;
  order: number;
}
