import type { FaithMoney } from "cocofaith-sdk/core";
export type RouletteMode = "normal" | "gambler" | "crazy";
export interface RoulettePlayer {
  uid: number;
  name: string;
  path: string;
  level: number;
  alive: boolean;
  timeouts: number;
  flags: Record<string, number>;
  chambers: boolean[];
  penalty: FaithMoney;
}
export interface RouletteState {
  mode: RouletteMode;
  players: RoulettePlayer[];
  order: number[];
  current: number;
  round: number;
  chambers: boolean[];
  field: string;
  extra: string;
  dealer: number;
  demon: number;
  fear: number;
  firstBlood: boolean;
  seal?: {
    source: number;
    target: number;
  };
  deaths: number[];
  pool: {
    gold: number;
    ascension_score: number;
  };
  feePool: number;
  turn: number;
  logs: string[];
  settled: boolean;
  maxLevelUids: number[];
  rewards: Array<{
    uid: number;
    place: number;
    base: FaithMoney;
    applied: FaithMoney;
  }>;
  aborted?: boolean;
}
export interface RouletteStats extends Record<string, unknown> {
  level: number;
  exp: number;
  honor: number;
  plays: number;
  normal: {
    plays: number;
    wins: number;
  };
  gambler: {
    plays: number;
    wins: number;
  };
  crazy: {
    plays: number;
    wins: number;
  };
}
export type RoulettePhase =
  | "start"
  | "reload"
  | "beforeShot"
  | "bullet"
  | "empty"
  | "afterShot"
  | "death";
export interface RouletteEffectContext {
  state: RouletteState;
  actor: RoulettePlayer;
  target: RoulettePlayer;
  random: RandomSource;
  damage: number;
  cancelled: boolean;
  bullet: boolean;
  messages: string[];
  tags: Set<string>;
  kill(player: RoulettePlayer, reason: string, forced?: boolean): void;
  addBullet(): void;
  addEmpty(): void;
}
export interface RouletteRule {
  id: string;
  name: string;
  description: string;
  modes?: readonly ("gambler" | "crazy")[];
  savesAsShields?: boolean;
  protections?: readonly RouletteProtection[];
  hooks?: Partial<Record<RoulettePhase, (context: RouletteEffectContext) => void>>;
  abilities?: Record<string, (context: RouletteEffectContext) => void>;
}
export interface RouletteProtection {
  id: string;
  kind: "shield" | "save";
  fallback?: boolean;
  available(context: RouletteEffectContext): number;
  probability(context: RouletteEffectContext): number;
  consume(context: RouletteEffectContext, layers: number): void;
}
export type RandomSource = () => number;

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
