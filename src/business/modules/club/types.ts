export type * from "./api";




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
