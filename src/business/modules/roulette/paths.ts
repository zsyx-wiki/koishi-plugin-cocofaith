import { pick, shuffle } from "./random";
import type { RouletteEffectContext as C, RouletteRegistry } from "./registry";
const log = (c: C, text: string) => c.messages.push(text);
export function chaos(c: C) {
    if (c.random() >= .8)
        return;
    c.tags.add("chaos_path");
    const value = c.random();
    if (value >= .9) {
        c.cancelled = true;
        log(c, `【混沌】扭曲了弹道，【${c.actor.name}】这一枪射向虚空。`);
    }
    else if (value >= .5) {
        const others = c.state.players.filter((p) => p.alive && p.uid !== c.target.uid);
        if (others.length) {
            c.target = pick(others, c.random);
            log(c, `【混沌】扭曲了因果，这一枪将由【${c.target.name}】承受。`);
        }
    }
}
export function registerPaths(registry: RouletteRegistry) {
    registry.registerPath({
        id: "life", name: "生命", description: "首次实弹有80%概率保命；两轮后恢复一次55%保命。保命时弹仓补一实弹。", protections: [{
                id: "life.save", kind: "save", available: (c) => !c.target.flags.lifeUsed ? 1 : c.target.flags.lifeSave || 0,
                probability: (c) => !c.target.flags.lifeUsed ? .8 : .55,
                consume(c, layers) {
                    const f = c.target.flags;
                    if (!f.lifeUsed)
                        f.lifeUsed = 1;
                    else
                        f.lifeSave -= layers;
                    f.lifeCooldown = 2;
                    c.addBullet();
                    log(c, `子弹击中了【${c.target.name}】，但【生命】的力量令其免于一死。`);
                },
            }], hooks: {
            reload(c) {
                const f = c.target.flags;
                if (f.lifeCooldown > 0 && --f.lifeCooldown === 0)
                    f.lifeSave = 1;
            },
        }
    });
    registry.registerPath({
        id: "void", name: "虚无", description: "实弹60%保命；空仓可能暴毙，不稳定性逐次增加。", protections: [{
                id: "void.save", kind: "save", available: () => 1, probability: () => .6,
                consume(c) {
                    c.target.flags.instability = (c.target.flags.instability || 0) + 3;
                    log(c, `【虚无】庇护了【${c.target.name}】，暴毙风险升至 ${c.target.flags.instability}%。`);
                },
            }], hooks: {
            empty(c) {
                c.target.flags.instability += 3;
                if (c.random() < .05 + c.target.flags.instability / 100)
                    c.kill(c.target, "虚无暴毙");
            },
        }
    });
    registry.registerPath({
        id: "chaos", name: "混沌", description: "开枪时可能改变目标或朝天射击。", hooks: { beforeShot(c) {
                if (!c.tags.has("chaos_field"))
                    chaos(c);
            } }
    });
    registry.registerPath({
        id: "sinking", name: "沉沦", description: "恐惧：加空仓后开枪，两轮冷却。无畏：加实弹后开枪，每轮一次。", protections: [{
                id: "sinking.save", kind: "save", available: (c) => c.target.flags.unwaveringSave || 0, probability: () => .6,
                consume(c, layers) {
                    c.target.flags.unwaveringSave -= layers;
                    log(c, `【无畏守护】庇护了【${c.target.name}】。`);
                },
            }], abilities: {
            "恐惧"(c) {
                if (c.actor.flags.fear > 0)
                    throw new Error("你的恐惧之心尚未平复，暂时无法再次使用");
                c.actor.flags.fear = 2;
                c.addEmpty();
                log(c, `【${c.actor.name}】直面恐惧，向弹仓加入一颗空仓。`);
            },
            "无畏"(c) {
                if (c.actor.flags.unwavering)
                    throw new Error("你本轮已经展现过无畏了");
                c.actor.flags.unwavering = 1;
                c.actor.flags.justUnwavering = 1;
                c.addBullet();
                log(c, `【${c.actor.name}】展现无畏，向弹仓加入一颗实弹。`);
            },
        }, hooks: {
            reload(c) {
                const f = c.target.flags;
                f.fear = Math.max(0, f.fear - 1);
                f.unwavering = 0;
                f.unwaveringSave = 0;
            },
            afterShot(c) {
                if (c.actor.alive && c.actor.flags.justUnwavering) {
                    c.actor.flags.justUnwavering = 0;
                    c.actor.flags.unwaveringSave = 1;
                    c.addBullet();
                    log(c, `【${c.actor.name}】依然屹立不倒，获得无畏守护，并补入一颗实弹。`);
                }
            },
        }
    });
    registry.registerPath({
        id: "existence", name: "存在", description: "独立弹仓，多两个空仓；25%概率将实弹削减至最多两颗。", hooks: {
            reload(c) {
                c.target.chambers = shuffle([...c.state.chambers, false, false], c.random);
                if (c.random() < .25) {
                    let n = 0;
                    c.target.chambers = c.target.chambers.map((b) => b ? ++n <= 2 : false);
                }
            },
        }
    });
    registry.registerPath({
        id: "civilization", name: "文明", description: "空仓后60%概率封锁下一人，随后获得一次50%保命机会。", hooks: {
            afterShot(c) {
                if (!c.actor.alive || c.bullet || c.cancelled || c.random() >= .6)
                    return;
                const next = c.state.players.find((p) => p.uid === c.state.current);
                if (next && next.uid !== c.actor.uid) {
                    next.flags.disabled = 1;
                    c.state.seal = { source: c.actor.uid, target: next.uid };
                    log(c, `【文明】的禁令降临，【${next.name}】的命途效果被封锁。`);
                }
            },
        }
    });
}
