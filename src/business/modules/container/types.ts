import type { FaithStatusIdentityState } from "cocofaith-sdk/core";
export type ContainerLevel = "mortal" | "subgod" | "truegod";
export interface ContainerState extends Record<string, unknown> {
    divinity: number;
    lastDripDate: string;
    consecrationCharges: number;
    lastChargeRecoveryDate: string;
    subgodName?: string;
    truegodName?: string;
    originalFaith?: string;
    path?: string;
}
export interface ContainerStatus {
    level: ContainerLevel;
    state: ContainerState;
    identity: Readonly<FaithStatusIdentityState>;
}
export interface ContainerGrantResult {
    kind: "container" | "fragment";
}
export interface ContainerInfusionResult {
    gained: number;
    divinity: number;
}
export interface ContainerConsecrationResult {
    count: number;
    spent: number;
    reward: number;
    divinity: number;
    charges: number;
}
export interface ContainerAscensionResult {
    godName: string;
    faith: string;
    titleId: string;
}
export interface ContainerTrueGodResult extends ContainerAscensionResult {
    path: string;
    cost: {
        gold: number;
        ascension_score: number;
    };
}
export interface ContainerGameplayApi {
    grant(uid: number, source?: string, idempotencyKey?: string): Promise<ContainerGrantResult>;
    status(uid: number): Promise<ContainerStatus>;
}
