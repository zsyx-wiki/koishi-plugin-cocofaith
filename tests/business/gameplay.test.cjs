const test = require("node:test")
const assert = require("node:assert/strict")
const business = require("../../lib/business/index.js")

test("defineGameplay turns one config declaration into defaults and validation", () => {
  const config = business.defineGameplayConfig({
    rewardGold: business.gameplayInteger(50, { min: 0, max: 100 }),
    publicNotice: business.gameplayBoolean(false),
  })

  assert.deepEqual(config.defaults, { rewardGold: 50, publicNotice: false })
  assert.deepEqual(config.parse({ rewardGold: 80, publicNotice: true }), {
    rewardGold: 80,
    publicNotice: true,
  })
  assert.throws(() => config.parse({ rewardGold: 101, publicNotice: false }))
})

test("simple atomic gameplay receives uid, state and reward helpers and may return text", async () => {
  const definition = business.defineGameplay({
    name: "daily_fish",
    config: business.defineGameplayConfig({
      rewardGold: business.gameplayInteger(50, { min: 0, max: 100 }),
    }),
    setup({ config }) {
      return { label: `奖励 ${config.rewardGold}` }
    },
    commands: [{
      id: "play",
      triggers: ["摸鱼", "每日摸鱼"],
      scenes: ["group"],
      atomic: "user",
      async run({ uid, state, economy, config, service }) {
        assert.equal(uid, 10000000)
        assert.equal(service.label, "奖励 50")
        assert.equal(state.gameDay, "2026-09-12")
        state.data.date = state.gameDay
        const reward = await economy.reward({ gold: config.rewardGold })
        return `摸鱼成功，获得 ${reward.applied.gold} 金币。`
      },
    }],
  })

  const module = business.adaptGameplayDefinition(definition)
  const moduleContext = {
    name: definition.name,
    core: { lifecycle: { defer(callback) { return { disposed: false, dispose: callback } } } },
    config: module.validateConfig(module.defaultConfig),
    provide() {}, use() {}, contribute() {}, collect() {},
  }
  await module.init(moduleContext)

  let saved
  let transactionOptions
  let rewardOptions
  const tx = {
    data: {
      get: async () => ({ private: {}, public: {} }),
      set: async (value) => { saved = value },
    },
    economy: {
      getWallet: async () => ({}),
      canAfford: async () => true,
      pay: async () => ({}),
      creditFixed: async () => ({}),
      reward: async (amount, options) => {
        rewardOptions = options
        return { applied: amount }
      },
    },
    items: {},
    users: {},
  }
  const core = {
    gameDay: { currentDate: () => "2026-09-12" },
    transaction: {
      run: async (_uid, task, options) => {
        transactionOptions = options
        return task(tx)
      },
    },
  }
  const result = await module.commands[0].execute({
    uid: 10000000,
    event: { uid: 10000000, scene: "group", content: "摸鱼", eventId: "message-1" },
    args: [],
    path: ["play"],
    core,
    config: moduleContext.config,
  })

  assert.deepEqual(result, { type: "text", content: "摸鱼成功，获得 50 金币。" })
  assert.deepEqual(saved, { private: { date: "2026-09-12" }, public: {} })
  assert.equal(transactionOptions.source, "daily_fish.play")
  assert.match(transactionOptions.idempotencyKey, /^daily_fish:play:/)
  assert.equal(rewardOptions.source, "daily_fish.play")
})

test("simple gameplay is registered-only by default and guest is explicit", () => {
  const registered = business.adaptGameplayDefinition(business.defineGameplay({
    name: "registered_probe",
    commands: [{ id: "probe", triggers: ["检查"], run: () => "ok" }],
  }))
  const guest = business.adaptGameplayDefinition(business.defineGameplay({
    name: "guest_probe",
    commands: [{ id: "probe", triggers: ["公开检查"], guest: true, run: () => "ok" }],
  }))

  assert.equal(registered.commands[0].allowUnregistered, false)
  assert.equal(guest.commands[0].allowUnregistered, true)
  assert.equal(business.defineAdvancedGameplay({ name: "compat", commands: registered.commands }).commands[0], registered.commands[0])
})

test("simple gameplay fail helper becomes a normal Business error", async () => {
  const module = business.adaptGameplayDefinition(business.defineGameplay({
    name: "failure_probe",
    commands: [{
      id: "probe",
      triggers: ["失败检查"],
      run() {
        business.fail("LIMIT_REACHED", "今天没有次数了。")
      },
    }],
  }))

  await assert.rejects(
    () => module.commands[0].execute({
      uid: 10000000,
      event: { uid: 10000000, scene: "group", content: "失败检查" },
      args: [],
      path: ["probe"],
      core: { lifecycle: { defer(callback) { return { disposed: false, dispose: callback } } } },
      config: {},
    }),
    (error) => error.code === "LIMIT_REACHED" && error.message === "今天没有次数了。",
  )
})

test('setup registrations and service are released on reload, failure and dispose', async () => {
  const registry = new business.BusinessInterfaceRegistry()
  let disposed = 0, deferred = 0
  const core = { lifecycle: { defer(callback) { return new business.CallbackDisposable(callback) } } }
  const makeContext = reward => ({ name: 'reload_test', core, config: { reward },
    provide: (name, value) => registry.provide('reload_test', name, value),
    use: (provider, name) => registry.use('reload_test', provider, name, new Set()),
    contribute() {}, collect() {},
  })
  const module = business.adaptGameplayDefinition(business.defineGameplay({ name: 'reload_test',
    setup(context) {
      context.provide('default', { reward: context.config.reward })
      context.defer(() => deferred++)
      if (context.config.reward < 0) throw new Error('bad reward')
      return { reward: context.config.reward }
    },
    dispose() { disposed++ },
    commands: [{ id: 'read', triggers: ['read'], run: ({ service }) => String(service.reward) }],
  }))
  await module.init(makeContext(1))
  await module.reload(makeContext(2), { reward: 1 })
  assert.equal(registry.list().length, 1)
  assert.equal(registry.use('reload_test', 'reload_test', 'default', new Set()).reward, 2)
  await assert.rejects(module.reload(makeContext(-1), { reward: 2 }), /bad reward/)
  assert.equal(registry.use('reload_test', 'reload_test', 'default', new Set()).reward, 2)
  await module.dispose()
  assert.equal(registry.list().length, 0)
  assert.equal(disposed, 3)
  assert.equal(deferred, 4)
})

test('simple command groups use the same Business router and validate before commit', async () => {
  const module = business.adaptGameplayDefinition(business.defineGameplay({ name: 'tree_test', commands: [{
    id: 'root', triggers: ['root'], children: [{ id: 'child', triggers: ['child'], run: () => 'ok' }],
  }] }))
  const router = new business.BusinessCommandRouter()
  router.register(module.name, module.commands)
  assert.equal(router.resolve({ content: 'root child', scene: 'group' }).commandId, 'root.child')
})

test('built-in schemas and runtime parsers share constraints and legacy keys', () => {
  const defaults = business.Config({})
  assert.equal(defaults.dailyPrayer.config.baseLimit, 1)
  assert.equal(defaults.voidPrayer.config.baseCost, 45)
  assert.throws(() => business.Config({ roulette: { config: { turnSeconds: 1 } } }))
  assert.throws(() => business.validateRouletteConfig({ turnSeconds: 1 }))
  const store = new business.BusinessConfigStore({ modules: {}, dailyPrayer: { config: { baseLimit: 2 } } })
  assert.equal(store.resolve(business.createDailyPrayerModule()).baseLimit, 2)
})

test('advanced gameplay accepts the same command vocabulary and retains legacy modules', async () => {
  const module = business.defineAdvancedGameplay({ name: 'advanced_probe', commands: [{ id: 'root', triggers: ['probe'], guest: true,
    children: [{ id: 'read', triggers: ['read'], run: () => 'ok' }],
  }] })
  const router = new business.BusinessCommandRouter()
  router.register(module.name, module.commands)
  const match = router.resolve({ content: 'probe read', scene: 'group' })
  assert.deepEqual(await match.command.execute({}), { type: 'text', content: 'ok' })
  assert.equal(module.commands[0].allowUnregistered, true)
})
