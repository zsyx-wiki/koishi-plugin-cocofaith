import type { FaithDefinition } from "../types";

export const FAITH_CAMPS = Object.freeze({
  生命: ["诞育", "繁荣", "死亡"], 沉沦: ["污堕", "腐朽", "湮灭"], 文明: ["秩序", "真理", "战争"],
  混沌: ["混乱", "痴愚", "沉默"], 存在: ["记忆", "时间"], 虚无: ["欺诈", "命运"],
} as const);

export const CORE_FAITH_PRAYERS = Object.freeze({
  诞育: { word: "感孕生命，衍育自然", deity: "生命之神" }, 繁荣: { word: "万物滋生，亦繁亦荣", deity: "繁荣之神" }, 死亡: { word: "灵魂安眠，生命终焉", deity: "死亡之神" },
  污堕: { word: "解脱枷锁，直面心欲", deity: "欲望之神" }, 腐朽: { word: "众生应腐，万物将朽", deity: "腐朽之神" }, 湮灭: { word: "于无中生，于寂中灭", deity: "湮灭之神" },
  秩序: { word: "文明火起，秩序长存", deity: "秩序之神" }, 真理: { word: "洞窥本质，行见真理", deity: "真理之神" }, 战争: { word: "何以求存，唯血与火", deity: "战争之神" },
  混乱: { word: "虚构规律，寰宇笑谈", deity: "混乱之神" }, 痴愚: { word: "生命皆痴，文明皆愚", deity: "痴愚之神" }, 沉默: { word: "万物归寂，寰宇无音", deity: "沉默之神" },
  记忆: { word: "昔我长铭，流光拓影", deity: "记忆之神" }, 时间: { word: "时光如隙，我亦如风", deity: "时间之神" }, 欺诈: { word: "不辨真伪，勿论虚实", deity: "欺诈之神" },
  命运: { word: "命若繁星，望而不及", deity: "命运之神" },
} as const);

export const CORE_FAITHS: readonly FaithDefinition[] = Object.freeze(
  Object.entries(FAITH_CAMPS).flatMap(([path, names]) => names.map((name) => Object.freeze({
    name, path, type: "fixed" as const, believer_count: 0,
    prayer_word: CORE_FAITH_PRAYERS[name].word,
    deity_name: CORE_FAITH_PRAYERS[name].deity,
  }))),
);
