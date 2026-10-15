import type { FaithBusinessCoreScope, FaithMoney } from "cocofaith-sdk/core";
import type { GameRoom, RoomTransaction } from "../rooms";
import { rouletteText } from "./messages";
import { advanceStats, benefits } from "./progress";
import type { RouletteState } from "./types";
import { initialStats } from "./types";
export async function settleRoulette(room: GameRoom<RouletteState>, tx: RoomTransaction, core: FaithBusinessCoreScope, aborted: boolean) {
    const s = room.state;
    if (s.settled)
        return;
    if (aborted) {
        s.aborted = true;
        for (const member of room.members) {
            const player = s.players.find((p) => p.uid === member.uid);
            const money = { gold: (member.ticket.gold ?? 0) + (player?.penalty.gold ?? 0), ascension_score: player?.penalty.ascension_score ?? 0 };
            if (Object.values(money).some(Boolean))
                await tx.player(member.uid).economy.creditFixed(money);
        }
        s.settled = true;
        return;
    }
    const winner = s.players.find((p) => p.alive);
    const second = winner && s.mode === "crazy" && s.extra !== "take_all" ? s.deaths.at(-1) : undefined;
    for (const p of s.players) {
        const account = tx.player(p.uid);
        const place = p.uid === winner?.uid ? 1 : p.uid === second ? 2 : 0;
        const amount: FaithMoney = {};
        let fixed = false;
        if (place === 1 || place === 2) {
            if (s.mode === "normal") {
                amount.gold = 20;
                amount.ascension_score = 5;
            }
            else if (s.mode === "gambler") {
                const user = await account.user.get();
                if (user.gold < 0 || user.ascension_score < 0) {
                    amount.gold = 30;
                    amount.ascension_score = 15;
                    fixed = true;
                }
                else {
                    amount.gold = Math.round(s.pool.gold * .7);
                    amount.ascension_score = Math.round(s.pool.ascension_score * .7);
                }
            }
            else if (s.extra === "take_all") {
                const share = p.uid === s.dealer ? .9 : .5;
                amount.gold = Math.round((s.feePool + s.pool.gold) * share);
                amount.ascension_score = Math.round(s.pool.ascension_score * share);
            }
            else {
                amount.gold = Math.round(s.feePool * (place === 1 ? .35 : .2) + s.pool.gold * (place === 1 ? .3 : .17));
                amount.ascension_score = Math.round(s.pool.ascension_score * (place === 1 ? .3 : .17));
            }
            const base = { ...amount };
            if (!fixed)
                for (const key of ["gold", "ascension_score"] as const)
                    amount[key] = Math.round((amount[key] ?? 0) * (1 + benefits(p.level).reward));
            let applied = amount;
            if (!fixed && Object.values(amount).some(Boolean))
                applied = (await core.economy.previewReward(p.uid, amount, "settlement")).applied;
            if (Object.values(applied).some(Boolean))
                await account.economy.creditFixed(applied);
            s.rewards.push({
                uid: p.uid, place, base, applied: { ...applied }
            });
            s.logs.push(place === 1
                ? rouletteText.winner(p.name, applied.gold ?? 0, applied.ascension_score ?? 0)
                : rouletteText.second(p.name, applied.gold ?? 0, applied.ascension_score ?? 0));
        }
        const stats = await account.progress(initialStats());
        const previousLevel = stats.level;
        if (advanceStats(stats, s.mode, place)) {
            await account.economy.creditFixed({ gold: 1000, ascension_score: 350 });
            await account.user.change({ audience_score: 5 });
            s.maxLevelUids.push(p.uid);
            s.logs.push(`${p.name}：轮盘满级，金币+1000、登神分+350、觐见分+5。`);
        }
        else if (stats.level > previousLevel) {
            s.logs.push(`${p.name}：轮盘等级 ${previousLevel} → ${stats.level}。`);
        }
        await account.saveProgress(stats);
    }
    if (!winner)
        s.logs.push(rouletteText.noWinner);
    s.settled = true;
}
