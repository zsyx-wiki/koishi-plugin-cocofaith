const test = require("node:test");
const assert = require("node:assert/strict");
const { App } = require("koishi");
const main = require("../../lib/index.js");
const { provideFaithAdapter } = require("cocofaith-sdk/adapter");

async function start() {
  const app = new App();
  app.plugin(require("@minatojs/driver-sqlite").default, { path: ":memory:" });
  app.plugin({
    name: "non-room-test-adapter",
    apply(ctx) {
      provideFaithAdapter(ctx, {
        id: "local",
        name: "Local",
        platform: "onebot",
        version: "test",
        mode: "normal",
      });
    },
  });
  app.plugin(main, {
    core: { gameDay: { enabled: false } },
    business: {
      roulette: { enabled: false },
      container: { enabled: false },
      modules: {
        rooms: { enabled: false },
      },
    },
  });
  await app.start();
  return app;
}
function use(app, provider, name = "default") {
  return app.faithBusiness.interfaces.use("non-room-test", provider, name, new Set([provider]));
}

test("SDK gameplays work through the main entry without room modules, and preserve live interfaces on reload", async () => {
  const app = await start();
  try {
    const core = app.faithCore,
      host = app.faithBusiness;
    const identity = {
      adapter: "onebot",
      type: "qq_account",
      value: "non-room-player",
      scope: "global",
    };
    let event = 0;
    const dispatch = (uid, content) =>
      host.dispatch({
        uid,
        identity,
        scene: "group",
        content,
        eventId: `non-room-${++event}`,
        adapter: { name: "Local", version: "test", allowRegistration: true },
      });
    assert.ok((await dispatch(null, "信仰 注册 诞育")).result);
    const uid = await core.adapter.resolve(identity);
    await core.users.change(uid, { gold: 100000, ascension_score: 10000 }, { isFixed: true });
    core.permissions.register("faith.creator", ({ uid: candidate }) => candidate === uid);
    const providers = ["title", "collection", "club", "binding", "void_prayer", "daily_prayer"];
    const interfaces = providers.map((provider) => use(app, provider));
    const fields = use(app, "faith_admin", "numeric-fields");
    const beforeFields = fields.list().map((field) => field.name);
    const collection = use(app, "collection");
    const collectible = core.items
      .all()
      .find((item) => item.level === "SP" && item.type === "道具");
    const removeRule = collection.configure(collectible.item_id, { pool: "重载验证" });
    for (const content of [
      "信仰 信息",
      "信仰 职业查看 诞育",
      "虚空祈求",
      "虚空祈求 次数",
      "捡垃圾",
      "图鉴 查看",
      "图鉴 详情",
      "称号 列表",
      "俱乐部 加入",
      "俱乐部 信息",
    ]) {
      const response = await dispatch(uid, content);
      assert.ok("result" in response, `${content}: ${JSON.stringify(response)}`);
    }
    const prayer = core.faiths.get("诞育").prayer_word;
    assert.equal(typeof prayer, "string");
    assert.ok((await dispatch(uid, prayer)).result);
    for (const module of [
      "faith",
      "title",
      "collection",
      "binding",
      "club",
      "void_prayer",
      "daily_prayer",
      "junk",
      "about",
    ]) {
      await host.reload(module);
    }
    providers.forEach((provider, index) =>
      assert.equal(use(app, provider), interfaces[index], provider),
    );
    assert.deepEqual(
      fields.list().map((field) => field.name),
      beforeFields,
    );
    assert.ok((await collection.progress(uid)).some((row) => row.pool === "重载验证"));
    removeRule();
    await host.reload("daily_prayer", {
      baseLimit: 2,
      goldMin: 10,
      goldMax: 10,
      ascensionMin: 0,
      ascensionMax: 0,
    });
    const beforePrayer = await core.users.require(uid);
    const expectedReward = await core.economy.previewReward(uid, { gold: 10 }, "daily_prayer.reward");
    assert.ok((await dispatch(uid, prayer)).result);
    assert.equal(
      (await core.users.require(uid)).gold - beforePrayer.gold,
      expectedReward.applied.gold,
    );
    assert.equal((await use(app, "daily_prayer").status(uid)).count, 2);
    await host.reload("void_prayer", { baseCost: 1, extraCost: 1 });
    const beforeDraw = await core.users.require(uid);
    assert.ok((await dispatch(uid, "虚空祈求")).result);
    assert.equal(beforeDraw.gold - (await core.users.require(uid)).gold, 1);

    assert.ok((await dispatch(uid, `信仰管理 数值 永久祈祷 uid ${uid} 1`)).result);
    assert.ok((await dispatch(uid, `信仰管理 数值 奖励祈求 uid ${uid} 1`)).result);
    assert.ok((await dispatch(uid, "图鉴 查看")).result);
    assert.ok((await dispatch(uid, "俱乐部 信息")).result);
  } finally {
    await app.stop();
  }
});

test("binding configuration reload keeps pending tokens and their reply channels usable", async () => {
  const app = await start();
  try {
    const core = app.faithCore,
      host = app.faithBusiness;
    const identity = { adapter: "onebot", type: "qq_account", value: "27182818", scope: "global" };
    const qq = {
      adapter: "qqbot",
      type: "qqbot_member_openid",
      value: "binding-member",
      scope: "group_chat",
      scopeValue: "binding-group",
    };
    const user = await core.faiths.registerUser(qq, "诞育");
    const replies = [];
    const request = await host.dispatch({
      uid: null,
      identity,
      scene: "private",
      content: "椰子水 申请绑定",
      reply: async (result) => replies.push(result),
    });
    assert.ok(request.result, JSON.stringify(request));
    const tokenA = request.result.content.match(/[A-Za-z0-9_-]{20,}/)[0];
    await host.reload("binding", { tokenTtlSeconds: 600 });
    const claimed = await host.dispatch({
      uid: user.uid,
      identity: qq,
      scene: "group",
      content: `椰子水 申请绑定 ${tokenA}`,
    });
    assert.ok(claimed.result, JSON.stringify(claimed));
    assert.equal(replies.length, 1);
    const tokenB = replies[0].content.match(/[A-Za-z0-9_-]{20,}/)[0];
    await host.reload("binding", { tokenTtlSeconds: 300 });
    const confirmed = await host.dispatch({
      uid: null,
      identity,
      scene: "private",
      content: `椰子水 确认绑定 ${tokenB}`,
    });
    assert.ok(confirmed.result, JSON.stringify(confirmed));
    assert.equal(await core.adapter.resolve(identity), user.uid);
  } finally {
    await app.stop();
  }
});
