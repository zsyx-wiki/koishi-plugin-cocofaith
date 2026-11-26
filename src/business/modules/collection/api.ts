import type { FaithItemDefinition } from "cocofaith-sdk/core";
export interface CollectionRule {
  excluded?: boolean;
  pool?: string;
  category?: string;
}
export interface CollectionEntry {
  item: Readonly<FaithItemDefinition>;
  category: string;
  pool: string;
}
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

export interface CollectionApi {
  state(uid: number): Promise<CollectionState>;
  has(uid: number, item: string): Promise<boolean>;
  progress(uid: number): Promise<CollectionProgress[]>;
  details(uid: number, limited?: boolean, page?: number): Promise<CollectionPage>;
  refresh(uid: number): Promise<number>;
  configure(itemId: string, rule: CollectionRule): () => void;
}
