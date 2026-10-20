import type { CollectionEntry } from "./catalog";
export interface CollectionState {
    uid: number;
    items: readonly string[];
}
export interface CollectionProgress {
    category: string;
    pool: string;
    collected: number;
    total: number;
}
export interface CollectionPage {
    page: number;
    pages: number;
    total: number;
    entries: readonly (CollectionEntry & {
        collected: boolean;
    })[];
}
