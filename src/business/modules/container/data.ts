import type { FaithItemDefinition, FaithStatusIdentityDefinition } from "cocofaith-sdk/core";
export const FAITH_CONTAINER_ITEM_ID = "faith_container";
export const DIVINITY_FRAGMENT_ITEM_ID = "divinity_fragment";
export const CONTAINER_IDENTITY_ID = "divinity_container";
export const CONTAINER_ITEMS: readonly FaithItemDefinition[] = Object.freeze([
    Object.freeze({
        item_id: FAITH_CONTAINER_ITEM_ID,
        name: "神性容器",
        type: "道具",
        level: "EX",
        description: "一个古老而神秘的容器，似乎能与信仰产生共鸣，并从中凝聚出纯粹的力量。",
        max_quantity: 1,
        marketable: false,
        price: 0,
        obtainable: false,
    }),
    Object.freeze({
        item_id: DIVINITY_FRAGMENT_ITEM_ID,
        name: "神性碎片",
        type: "道具",
        level: "EX",
        description: "凝聚着纯粹神性的碎片，可以投入神性容器以加速神性的滴落。",
        max_quantity: 0,
        marketable: false,
        price: 0,
        obtainable: false,
    }),
]);
export const CONTAINER_IDENTITY: FaithStatusIdentityDefinition = Object.freeze({
    id: CONTAINER_IDENTITY_ID,
    name: "神性容器",
    description: "记录容器神性、觐献次数及从神/真神身份。",
    levels: Object.freeze([
        Object.freeze({
            id: "mortal", name: "凡身", rank: 0
        }),
        Object.freeze({
            id: "subgod", name: "从神", rank: 10
        }),
        Object.freeze({
            id: "truegod", name: "真神", rank: 20
        }),
    ]),
});
export const DAILY_DRIP_RATES = Object.freeze([
    Object.freeze({ amount: 0.5, odds: 0.45 }),
    Object.freeze({ amount: 1, odds: 0.35 }),
    Object.freeze({ amount: 1.5, odds: 0.2 }),
]);
export const INFUSION_RATES = Object.freeze([
    Object.freeze({
        maximum: 50, roulette: 0.75, fragment: 15
    }),
    Object.freeze({
        maximum: 100, roulette: 0.6, fragment: 15
    }),
    Object.freeze({
        maximum: 150, roulette: 0.5, fragment: 10
    }),
    Object.freeze({
        maximum: 250, roulette: 0.45, fragment: 10
    }),
]);
