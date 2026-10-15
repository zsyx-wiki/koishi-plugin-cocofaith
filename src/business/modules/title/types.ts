import type { BonusValueType } from "cocofaith-sdk/core";
export interface TitleBonus {
    type: BonusValueType;
    modifier?: number;
    fixedBonus?: number;
    activeWhen?: "owned" | "equipped";
    detail?: string;
}
export interface TitleDefinition {
    id: string;
    name: string;
    description: string;
    source: string;
    hidden?: boolean;
    custom?: boolean;
    bonuses?: readonly TitleBonus[];
}
export interface UserTitleState {
    uid: number;
    titles: readonly string[];
    active: string | null;
    updatedAt: Date;
}
export interface TitleServiceApi {
    register(definition: TitleDefinition, options?: {
        replace?: boolean;
    }): Readonly<TitleDefinition>;
    registerMany(definitions: readonly TitleDefinition[], options?: {
        replace?: boolean;
    }): readonly Readonly<TitleDefinition>[];
    unregister(idOrName: string, options?: {
        force?: boolean;
    }): Promise<boolean>;
    get(id: string): Readonly<TitleDefinition> | undefined;
    getByName(name: string): Readonly<TitleDefinition> | undefined;
    resolve(idOrName: string): Readonly<TitleDefinition> | undefined;
    all(): readonly Readonly<TitleDefinition>[];
    listOwned(uid: number): Promise<readonly Readonly<TitleDefinition>[]>;
    getActive(uid: number): Promise<Readonly<TitleDefinition> | null>;
    grant(uid: number, idOrName: string): Promise<boolean>;
    revoke(uid: number, idOrName: string): Promise<boolean>;
    use(uid: number, idOrName: string | null): Promise<Readonly<TitleDefinition> | null>;
}
