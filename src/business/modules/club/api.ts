export type ClubLevel = "public" | "silver" | "gold" | "honor" | "hall";
export interface ClubStats extends Record<string, unknown> {
  feeCount: number;
  goldContribution: number;
  ascensionContribution: number;
  joinedAt: string;
  lastFeeDate: string;
  duesEnabled: boolean;
  hallUnlocked?: boolean;
}
export interface ClubPool {
  gold: number;
  ascension: number;
}
export interface ClubStatus {
  uid: number;
  level: ClubLevel;
  levelName: string;
  active: boolean;
  duesEnabled: boolean;
  stats: ClubStats;
}

export interface ClubApi {
  status(uid: number): Promise<ClubStatus | null>;
  pool(): Promise<ClubPool>;
}
