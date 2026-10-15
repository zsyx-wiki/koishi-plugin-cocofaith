const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const sqlite = require('@minatojs/driver-sqlite').default
const plugin = require('../../lib/index.js')
const corePlugin = require('../../lib/core/index.js')
const { provideFaithAdapter } = require('cocofaith-sdk/adapter')
const fixtureAdapter = { name: 'test-adapter', apply(ctx) { provideFaithAdapter(ctx, { id: 'test', name: 'Test', platform: 'test', version: '1', mode: 'normal' }) } }
const version = require('../../package.json').version

const delay = () => new Promise(resolve => setImmediate(resolve))
async function waitFor(check) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (check()) return
    await delay()
  }
  throw new Error('Timed out waiting for lifecycle cleanup')
}
function hooks(app) {
  return Object.fromEntries(Object.entries(app.events._hooks).map(([name, handlers]) => [name, handlers.length]).filter(([, count]) => count))
}
function createApp() {
  const app = new App()
  app.plugin(fixtureAdapter)
  app.plugin(sqlite, { path: ':memory:' })
  return app
}

test('main entry supplies both services and executes existing gameplay', { timeout: 10000 }, async () => {
  const app = createApp()
  const errors = []
  app.on('internal/error', error => errors.push(error))
  const fork = app.plugin(plugin, { core: { registration: { initialGold: 987 }, gameDay: { enabled: false } } })
  await app.start()
  const core = app.faithCore, business = app.faithBusiness
  try {
    assert.equal(core.lifecycle.state, 'ready')
    assert.ok(business.status().every(item => item.state === 'ready'))
    const identity = { adapter: 'onebot', type: 'qq_account', value: 'merged-user', scope: 'global' }
    const user = await core.faiths.registerUser(identity, '诞育')
    assert.equal(user.gold, 987)
    const first = await business.dispatch({ uid: user.uid, identity, scene: 'group', content: '捡垃圾', eventId: 'merged-junk' })
    assert.ok(first.result, JSON.stringify(first))
    const about = await business.dispatch({ uid: user.uid, scene: 'group', content: '关于椰子水' })
    assert.ok(about.result.content.includes(`CoCoFaith：v${version}`))
    await core.reloadConfig({ ...core.config, registration: { initialGold: 456 } })
    assert.equal(core.config.registration.initialGold, 456)
    await business.reload('junk')
    assert.equal(business.status('junk').state, 'ready')
    assert.deepEqual(errors, [])
  } finally {
    fork.dispose()
    await waitFor(() => core.lifecycle.state === 'disposed' && business.list().length === 0)
    await app.stop()
  }
})

test('loading after app ready, unloading, then loading again leaves no owned listeners or timers', { timeout: 10000 }, async () => {
  const app = createApp()
  await app.start()
  const baseline = hooks(app)
  for (let run = 0; run < 2; run++) {
    const fork = app.plugin(plugin, { core: { gameDay: { enabled: true, runOnStartup: false } } })
    await app.events.flush()
    const core = app.faithCore, business = app.faithBusiness
    assert.equal(core.lifecycle.state, 'ready')
    assert.equal(business.status('junk').state, 'ready')
    assert.ok(core.gameDay.timer)
    fork.dispose()
    await waitFor(() => core.lifecycle.state === 'disposed' && business.list().length === 0)
    assert.equal(core.gameDay.timer, undefined)
    assert.equal(app.faithCore, undefined)
    assert.equal(app.faithBusiness, undefined)
    assert.deepEqual(hooks(app), baseline)
  }
  await app.stop()
})

test('unified configuration update drains and remounts children while preserving UID and database data', { timeout: 10000 }, async () => {
  const app = createApp()
  const fork = app.plugin(plugin, { core: { gameDay: { enabled: false } } })
  await app.start()
  try {
    const before = app.faithCore
    const beforeLifecycle = before.lifecycle
    const user = await before.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'config-user', scope: 'global' }, '诞育')
    fork.update({ core: { registration: { initialGold: 999 }, gameDay: { enabled: false } }, business: { junk: { config: { paidGoldCost: 333 } } } })
    await app.events.flush()
    assert.equal(beforeLifecycle.state, 'disposed')
    assert.notEqual(app.faithCore, before)
    assert.equal((await app.faithCore.users.require(user.uid)).gold, user.gold)
    assert.equal(app.faithCore.config.registration.initialGold, 999)
    assert.equal(app.faithBusiness.status('junk').state, 'ready')
    assert.equal(app.faithBusiness.manager.registry.runtimes.get('junk').config.paidGoldCost, 333)
  } finally { fork.dispose(); await app.stop() }
})

test('database injection waits without a self-injection deadlock', { timeout: 10000 }, async () => {
  const app = new App()
  app.plugin(fixtureAdapter)
  app.plugin(plugin, { core: { gameDay: { enabled: false } } })
  assert.equal(app.faithCore, undefined)
  assert.equal(app.faithBusiness, undefined)
  app.plugin(sqlite, { path: ':memory:' })
  await app.start()
  assert.equal(app.faithCore.lifecycle.state, 'ready')
  assert.equal(app.faithBusiness.status('junk').state, 'ready')
  await app.stop()
})

test('startup failure cleans both children and permits a fresh load', { timeout: 10000 }, async () => {
  const app = createApp()
  const errors = []
  app.on('internal/error', error => errors.push(error))
  await app.start()
  const before = hooks(app)
  const originalStart = plugin.business.BusinessModuleManager.prototype.start
  plugin.business.BusinessModuleManager.prototype.start = async function () {
    await originalStart.call(this)
    throw new Error('startup failure probe')
  }
  const fork = app.plugin(plugin, { core: { gameDay: { enabled: false } } })
  await app.events.flush()
  await waitFor(() => !app.faithCore && !app.faithBusiness)
  assert.ok(errors.length)
  plugin.business.BusinessModuleManager.prototype.start = originalStart
  fork.dispose()
  assert.deepEqual(hooks(app), before)
  const healthy = app.plugin(plugin, { core: { gameDay: { enabled: false } } })
  await app.events.flush()
  assert.equal(app.faithCore.lifecycle.state, 'ready')
  assert.equal(app.faithBusiness.status('junk').state, 'ready')
  healthy.dispose()
  await app.stop()
})

test('Core initialization and ready are single-flight and dispose waits for pending initialization', async () => {
  const lifecycle = new corePlugin.FaithLifecycleService({ logger: () => ({ debug() {}, error() {} }), on() {} })
  let release, initialized = 0, readied = 0
  lifecycle.onInit(async () => { initialized++; await new Promise(resolve => { release = resolve }) })
  lifecycle.onReady(() => { readied++ })
  const initializing = lifecycle.init()
  const ready = lifecycle.ready()
  assert.equal(lifecycle.ready(), ready)
  release()
  await Promise.all([initializing, ready])
  assert.equal(initialized, 1)
  assert.equal(readied, 1)
  await lifecycle.dispose()
  assert.equal(lifecycle.state, 'disposed')
})

test('unload drains an executing command before clearing Core registries', { timeout: 10000 }, async () => {
  const app = createApp()
  const fork = app.plugin(plugin, { core: { gameDay: { enabled: false } } })
  let release, entered
  const started = new Promise(resolve => { entered = resolve })
  const barrier = new Promise(resolve => { release = resolve })
  app.plugin({ name: 'merge-drain-probe', inject: ['faithBusiness'], apply(ctx) {
    const registration = ctx.faithBusiness.register(plugin.business.defineGameplay({ name: 'merge_drain',
      commands: [{ id: 'play', triggers: ['merge_drain'], atomic: 'user', async run({ economy }) {
        entered()
        await barrier
        await economy.creditFixed({ gold: 1 })
        return 'done'
      } }],
    }))
    ctx.on('dispose', () => registration.dispose())
  } })
  await app.start()
  const core = app.faithCore, business = app.faithBusiness
  const lifecycle = core.lifecycle
  const user = await core.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'drain-user', scope: 'global' }, '诞育')
  const running = business.dispatch({ uid: user.uid, scene: 'group', content: 'merge_drain', eventId: 'drain-1' })
  await started
  fork.dispose()
  assert.notEqual(lifecycle.state, 'disposed')
  release()
  assert.equal((await running).result.content, 'done')
  await waitFor(() => lifecycle.state === 'disposed')
  const [saved] = await app.database.get('faith_core_users_data', { uid: user.uid })
  assert.equal(saved.gold, user.gold + 1)
  assert.equal(core.items.all().length, 0)
  await app.stop()
})

test('existing split service data is reusable after switching to the main entry', { timeout: 10000 }, async () => {
  const app = createApp()
  const oldCore = app.plugin(corePlugin, { gameDay: { enabled: false } })
  const oldBusiness = app.plugin(require('../../lib/business/index.js'), {})
  await app.start()
  const core = app.faithCore, business = app.faithBusiness, lifecycle = core.lifecycle
  const identity = { adapter: 'onebot', type: 'qq_account', value: 'split-user', scope: 'global' }
  const user = await core.faiths.registerUser(identity, '诞育', 777)
  const scope = core.createBusinessScope('fixture')
  await scope.transaction.run(user.uid, async tx => {
    await tx.data.set({ private: { count: 3 }, public: { label: 'kept' } })
    await tx.items.give(core.items.all()[0].item_id, 1)
  })
  const inventory = await core.items.getInventory(user.uid)
  await business.shutdown()
  await business.lifecycle.dispose()
  await lifecycle.dispose()
  oldBusiness.dispose(); oldCore.dispose()
  const fork = app.plugin(plugin, { core: { gameDay: { enabled: false } } })
  await app.events.flush()
  assert.equal(await app.faithCore.adapter.resolve(identity), user.uid)
  assert.equal((await app.faithCore.users.require(user.uid)).gold, 777)
  assert.deepEqual(await app.faithCore.items.getInventory(user.uid), inventory)
  const row = await app.faithCore.createBusinessScope('fixture').data.get(user.uid)
  assert.deepEqual(row.private, { count: 3 })
  assert.deepEqual(row.public, { label: 'kept' })
  assert.equal(app.faithBusiness.status('junk').state, 'ready')
  fork.dispose()
  await app.stop()
})

test('Core init failure releases CoCoFaith and its owned listeners', { timeout: 10000 }, async () => {
  const app = createApp()
  app.on('internal/error', () => {})
  await app.start()
  const baseline = hooks(app)
  const prototype = plugin.FaithCoreService.prototype
  const original = prototype.registerCoreLifecycle
  prototype.registerCoreLifecycle = function () {
    original.call(this)
    this.lifecycle.onInit(() => { throw new Error('core init failure probe') }, { critical: true })
  }
  let fork
  try {
    fork = app.plugin(plugin, {})
    await app.events.flush()
    await waitFor(() => !app.faithCore && !app.faithBusiness)
    assert.deepEqual(hooks(app), baseline)
  } finally { prototype.registerCoreLifecycle = original; fork?.dispose(); await app.stop() }
})

test('disposal waits for pending initialization without reviving the lifecycle', async () => {
  const lifecycle = new corePlugin.FaithLifecycleService({ logger: () => ({ debug() {}, error() {} }), on() {} })
  let release, ready = 0, complete = false
  lifecycle.onInit(() => new Promise(resolve => { release = resolve }))
  lifecycle.onReady(() => { ready++ })
  const starting = lifecycle.ready()
  const stopping = lifecycle.dispose().then(() => { complete = true })
  await delay()
  assert.equal(complete, false)
  release()
  await Promise.all([starting, stopping])
  assert.equal(lifecycle.state, 'disposed')
  assert.equal(ready, 0)
})

test('an existing external service is rejected without disposing that service', { timeout: 10000 }, async () => {
  const app = createApp()
  app.on('internal/error', () => {})
  await app.start()
  let disposed = 0
  const sentinel = { lifecycle: { dispose() { disposed++ } } }
  const remove = app.set('faithCore', sentinel)
  const fork = app.plugin(plugin, {})
  await app.events.flush()
  assert.equal(app.faithCore.lifecycle, sentinel.lifecycle)
  assert.equal(disposed, 0)
  assert.equal(app.faithBusiness, undefined)
  fork.dispose()
  remove()
  await app.stop()
})

test('synchronous Business registration failure releases Core and owned listeners', { timeout: 10000 }, async () => {
  const app = createApp()
  const errors = []
  app.on('internal/error', error => errors.push(error))
  await app.start()
  const before = hooks(app)
  const register = plugin.business.BusinessModuleManager.prototype.register
  plugin.business.BusinessModuleManager.prototype.register = function (module) {
    register.call(this, module)
    throw new Error('registration failure probe')
  }
  let fork
  try {
    fork = app.plugin(plugin, { core: { gameDay: { enabled: false } } })
    await app.events.flush()
    await waitFor(() => !app.faithCore && !app.faithBusiness)
    assert.ok(errors.some(error => String(error).includes('registration failure probe')))
  } finally {
    plugin.business.BusinessModuleManager.prototype.register = register
    fork?.dispose()
    await app.events.flush()
    assert.deepEqual(hooks(app), before)
    await app.stop()
  }
})
