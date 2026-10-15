import { Context } from "koishi";
import { FaithCoreError } from "../errors";
import { KeyedLockService } from "../lock";
import { FaithTransactionService } from "../transaction";
import type { FaithCoreBusinessData } from "../types";
import { FaithUsersService } from "../users";
import { assertBusinessName, cloneBusinessRecord } from "../validation";
export class FaithBusinessDataService {
    constructor(private ctx: Context, private transactions: FaithTransactionService, private locks: KeyedLockService, private users: FaithUsersService) {
    }
    async get(uid: number, business: string): Promise<FaithCoreBusinessData> {
        assertBusinessName(business);
        const [, existing] = await Promise.all([
            this.users.require(uid),
            this.ctx.database.get("faith_core_business", { uid, business }, { limit: 1 }).then((rows) => rows[0]),
        ]);
        if (existing)
            return existing;
        return this.locks.run(`business-data:${business}:uid:${uid}`, () => this.transactions.run(async (database) => {
            await this.users.require(uid, database);
            const [row] = await database.get("faith_core_business", { uid, business });
            if (row)
                return row;
            try {
                return await database.create("faith_core_business", {
                    uid, business, version: 0, private: {}, public: {}
                });
            }
            catch (error) {
                const [created] = await database.get("faith_core_business", { uid, business });
                if (created)
                    return created;
                throw error;
            }
        }));
    }
    async set(uid: number, business: string, data: {
        private?: Record<string, unknown>;
        public?: Record<string, unknown>;
    }) {
        assertBusinessName(business);
        if (data.private === undefined && data.public === undefined)
            throw new Error("业务数据更新不能为空");
        const privateData = data.private === undefined ? undefined : cloneBusinessRecord(data.private);
        const publicData = data.public === undefined ? undefined : cloneBusinessRecord(data.public);
        return this.locks.run(`business-data:${business}:uid:${uid}`, () => this.transactions.run(async (database) => {
            await this.users.require(uid, database);
            let [row] = await database.get("faith_core_business", { uid, business });
            if (!row) {
                try {
                    row = await database.create("faith_core_business", {
                        uid, business, version: 0, private: {}, public: {}
                    });
                }
                catch (error) {
                    [row] = await database.get("faith_core_business", { uid, business });
                    if (!row)
                        throw error;
                }
            }
            const version = Number.isSafeInteger(row.version) ? row.version : 0;
            const result = await database.set("faith_core_business", { id: row.id, version }, {
                version: version + 1,
                private: privateData ?? row.private,
                public: publicData ?? row.public,
            });
            if (result.matched !== 1)
                throw new FaithCoreError("TRANSACTION_CONFLICT", "业务数据已被其他实例修改，请重试", { uid, business });
            const [updated] = await database.get("faith_core_business", { id: row.id });
            if (!updated)
                throw new FaithCoreError("DATA_INTEGRITY_ERROR", "业务数据更新后记录丢失", { uid, business });
            return updated;
        }));
    }
}
