const test = require("node:test")
const assert = require("node:assert/strict")
const business = require("../../lib/business/index.js")
const { App } = require("koishi")
const corePlugin = require("../../lib/core/index.js")

const key = (identity) => JSON.stringify([
  identity.adapter, identity.type, identity.value, identity.scope, identity.scopeValue || "",
])

function fixture() {
  const owners = new Map()
  const emitted = []
  const identities = {
    resolve: async (identity) => owners.get(key(identity)) ?? null,
    bindExisting: async (uid, identity) => {
      const current = owners.get(key(identity))
      if (current !== undefined && current !== uid) throw new Error("identity conflict")
      if (current === uid) return false
      owners.set(key(identity), uid)
      return true
    },
    list: async (uid) => [...owners].filter(([, owner]) => owner === uid).map(([encoded]) => {
      const [adapter, type, value, scope, scope_value] = JSON.parse(encoded)
      return { id: 1, uid, adapter, type, value, scope, scope_value }
    }),
  }
  const core = {
    identities,
    users: { require: async (uid) => ({ uid }) },
    hooks: { emit: async (name, value) => emitted.push({ name, value }) },
  }
  return { core, owners, emitted }
}

const onebotIdentity = { adapter: "onebot", type: "qq_account", value: "123456", scope: "global" }
const qqIdentity = { adapter: "qqbot", type: "qqbot_member_openid", value: "member-a", scope: "group_chat", scopeValue: "group-a" }

test("binding links an unregistered OneBot QQ only after the same QQ confirms TokenB", async () => {
  const { core, owners, emitted } = fixture()
  owners.set(key(qqIdentity), 10000000)
  const delivered = []
  const service = new business.BindingService(core, business.DEFAULT_BINDING_CONFIG)
  try {
    const issued = await service.issue({
      uid: null, identity: onebotIdentity, scene: "private", content: "椰子水 申请绑定",
      reply: async (result) => delivered.push(result),
    })
    assert.equal(issued.kind, "issued")
    assert.match(issued.tokenA, /^CFA-/)

    const claimed = await service.claim({
      uid: 10000000, identity: qqIdentity, scene: "group", content: "",
    }, issued.tokenA)
    assert.deepEqual(claimed, { kind: "claimed", qq: "123456" })
    assert.equal(delivered.length, 1)
    const tokenB = delivered[0].content.match(/TokenB：(CFA-[A-Za-z0-9_-]+)/)[1]

    await assert.rejects(() => service.confirm({
      uid: null,
      identity: { ...onebotIdentity, value: "attacker" },
      scene: "private",
      content: "",
    }, tokenB), /同一 OneBot QQ/)
    assert.equal(owners.get(key(onebotIdentity)), undefined)

    const completed = await service.confirm({
      uid: null, identity: onebotIdentity, scene: "private", content: "",
    }, tokenB)
    assert.deepEqual(completed, { uid: 10000000, qq: "123456" })
    assert.equal(owners.get(key(onebotIdentity)), 10000000)
    assert.equal(emitted[0].name, "identity-linked")
    await assert.rejects(() => service.confirm({
      uid: 10000000, identity: onebotIdentity, scene: "private", content: "",
    }, tokenB), /无效或已过期/)
  } finally {
    service.dispose()
  }
})

test("binding refuses missing QQBot UID and never replaces another UID owner", async () => {
  const { core, owners } = fixture()
  const service = new business.BindingService(core, business.DEFAULT_BINDING_CONFIG)
  try {
    const first = await service.issue({
      uid: null, identity: onebotIdentity, scene: "private", content: "",
      reply: async () => {},
    })
    await assert.rejects(() => service.claim({
      uid: null, identity: qqIdentity, scene: "group", content: "",
    }, first.tokenA), /先在 QQ 官方机器人完成注册/)

    owners.set(key(onebotIdentity), 10000009)
    owners.set(key(qqIdentity), 10000000)
    const already = await service.issue({
      uid: 10000009, identity: onebotIdentity, scene: "private", content: "",
      reply: async () => {},
    })
    assert.deepEqual(already, { kind: "already-bound", uid: 10000009 })
  } finally {
    service.dispose()
  }
})

test("user information reports the resolved UID and its bound OneBot QQ", async () => {
  const { core, owners } = fixture()
  owners.set(key(qqIdentity), 10000000)
  owners.set(key(onebotIdentity), 10000000)
  const service = new business.BindingService(core, business.DEFAULT_BINDING_CONFIG)
  try {
    const info = await service.userInfo({
      uid: 10000000, identity: qqIdentity, scene: "group", content: "",
      adapter: { name: "CoCoFaith Adapter QQ", version: "test" },
    })
    assert.equal(info.uid, 10000000)
    assert.deepEqual(info.qqAccounts, ["123456"])
    assert.equal(info.adapter, "CoCoFaith QQ")
    assert.equal(info.identity, undefined)
    assert.equal(business.MESSAGES.binding.info(info.adapter, info.uid, info.qqAccounts), "平台：CoCoFaith QQ\nUID：10000000\nQQ：123456")
  } finally {
    service.dispose()
  }
})

test("Core and Business integration binds OneBot QQ without allocating another UID", async () => {
  const app = new App()
  app.plugin(require("@minatojs/driver-sqlite").default, { path: ":memory:" })
  app.plugin(corePlugin, { gameDay: { enabled: false } })
  app.plugin(business, {})
  await app.start()
  try {
    const qqbot = { adapter: "qqbot", type: "qqbot_member_openid", value: "member-integration", scope: "group_chat", scopeValue: "group-integration" }
    const onebot = { adapter: "onebot", type: "qq_account", value: "654321", scope: "global" }
    const faith = app.faithCore.faiths.all()[0].name
    const user = await app.faithCore.faiths.registerUser(qqbot, faith, 1000)
    const onebotMessages = []

    const issued = await app.faithBusiness.dispatch({
      uid: null, identity: onebot, scene: "private", content: "椰子水 申请绑定",
      reply: async (result) => onebotMessages.push(result),
    })
    assert.equal(issued.matched, true)
    assert.ok("result" in issued)
    const tokenA = issued.result.content.match(/TokenA：(CFA-[A-Za-z0-9_-]+)/)[1]

    const claimed = await app.faithBusiness.dispatch({
      uid: user.uid, identity: qqbot, scene: "group", content: `椰子水 申请绑定 ${tokenA}`,
    })
    assert.equal(claimed.matched, true)
    assert.ok("result" in claimed)
    assert.equal(onebotMessages.length, 1)
    const tokenB = onebotMessages[0].content.match(/TokenB：(CFA-[A-Za-z0-9_-]+)/)[1]

    const confirmed = await app.faithBusiness.dispatch({
      uid: null, identity: onebot, scene: "private", content: `椰子水 确认绑定 ${tokenB}`,
    })
    assert.equal(confirmed.matched, true)
    assert.ok("result" in confirmed)
    assert.equal(await app.faithCore.adapter.resolve(onebot), user.uid)
    assert.equal((await app.faithCore.users.listUids()).length, 1)
  } finally {
    await app.stop()
  }
})
