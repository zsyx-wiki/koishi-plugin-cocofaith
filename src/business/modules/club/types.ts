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
export interface ClubTableRow extends Record<string, unknown> {
    key: string;
    kind: "pool" | "payout" | "settlement";
    uid: number;
    gold: number;
    ascension_score: number;
    weight: number;
    status: string;
    version: number;
    created_at: Date;
    updated_at: Date;
}
