import { pick, shuffle } from "./random";
import type { RouletteRegistry } from "./registry";
export const GAMBLER_FIELDS = ["life", "sinking", "civilization", "chaos", "existence", "void"] as const;
export const CRAZY_FIELDS = ["crazy", "crazy_madness"] as const;
export function registerFields(r: RouletteRegistry) {
    r.registerField({
        id: "life", name: "生命", description: "每人一次80%概率的场地保命。", protections: [{
                id: "field.life", kind: "save", available: (c) => c.target.flags.disabled ? 0 : c.target.flags.fieldLife || 0, probability: () => .8,
                consume(c, layers) {
                    c.target.flags.fieldLife -= layers;
                    c.messages.push(`【生命场地】的祝福庇护了【${c.target.name}】。`);
                },
            }], hooks: {
            start(c) {
                c.target.flags.fieldLife = 1;
            },
        }
    });
    r.registerField({
        id: "sinking", name: "沉沦", description: "每轮可退缩一次：加入一实一空并开枪。", abilities: {
            "退缩"(c) {
                if (c.actor.flags.retreat)
                    throw new Error("你本轮已经退缩过了");
                c.actor.flags.retreat = 1;
                c.addEmpty();
                c.addBullet();
                c.messages.push(`【${c.actor.name}】选择退缩，恶魔加入一实一空。`);
            },
        }
    });
    r.registerField({
        id: "civilization", name: "文明", description: "开枪前50%概率封锁行动者能力。", hooks: {
            beforeShot(c) {
                if (c.random() < .5) {
                    c.actor.flags.disabled = 1;
                    c.messages.push(`【文明场地】的枷锁降临，【${c.actor.name}】的命途效果被封锁。`);
                }
            },
        }
    });
    r.registerField({
        id: "chaos", name: "混沌", description: "每次开枪随机选择存活目标。", hooks: {
            beforeShot(c) {
                c.tags.add("chaos_field");
                c.target = pick(c.state.players.filter((p) => p.alive), c.random);
                c.messages.push(`【混沌场地】指向了【${c.target.name}】。`);
            },
        }
    });
    r.registerField({
        id: "existence", name: "存在", description: "行动后扩充弹仓并加入实弹。", hooks: {
            afterShot(c) {
                c.addEmpty();
                c.addEmpty();
                c.addBullet();
                c.messages.push("【存在场地】回响：弹仓加入两颗空仓和一颗实弹。");
                for (const p of c.state.players)
                    if (p.alive && p.path === "存在")
                        p.chambers = shuffle([...p.chambers, false, false, true], c.random);
            },
        }
    });
    r.registerField({
        id: "void", name: "虚无", description: "重新装填时66%概率随机淘汰一人。"
    });
    r.registerField({
        id: "crazy", name: "疯狂", modes: ["crazy"], savesAsShields: true, description: "免死转为护盾，优先于场地护盾抵挡伤害；每轮一名疯魔连续随机射击至出现实弹。", protections: [{
                id: "field.crazy", kind: "shield", fallback: true, available: (c) => c.target.flags.disabled ? 0 : c.target.flags.shields || 0, probability: () => 1,
                consume(c, layers) {
                    c.target.flags.shields -= layers;
                    c.messages.push(`【${c.target.name}】的疯狂护盾抵消 ${layers} 点伤害（剩余 ${c.target.flags.shields} 层）。`);
                },
            }], hooks: {
            start(c) {
                c.target.flags.shields = 1;
            },
            death(c) {
                for (const p of c.state.players)
                    if (p.alive)
                        p.flags.shields = Math.min(4, p.flags.shields + 1);
            },
        }
    });
    r.registerField({
        id: "crazy_madness", name: "癫狂", modes: ["crazy"], description: "一次50%场地保命；射击可能触发随机淘汰、连锁淘汰和补弹。", protections: [{
                id: "field.madness", kind: "save", available: (c) => c.target.flags.madnessSave ? 0 : 1, probability: () => .5,
                consume(c) {
                    c.target.flags.madnessSave = 1;
                    c.messages.push(`致命攻击袭向【${c.target.name}】，但【癫狂】的庇护令其免于一死。`);
                },
            }]
    });
}
