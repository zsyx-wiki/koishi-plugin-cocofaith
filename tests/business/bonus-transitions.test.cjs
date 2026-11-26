const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const corePlugin = require('../../lib/core/index.js')
const business = require('../../lib/business/index.js')

function barrier() {
  let enter, release
  return { started: new Promise(resolve => { enter = resolve }), wait: new Promise(resolve => { release = resolve }),
    enter: () => enter(), release: () => release() }
}

async function host(run) {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(corePlugin, { gameDay: { enabled: false } })
  await app.start()
  const manager = new business.BusinessModuleManager({ modules: {} }, app.faithCore, () => {})
  try { await run(manager, app.faithCore, app.database) }
  finally { await manager.shutdown(); await app.stop() }
}

async function fixture(manager, core, { phase = 'setup', pausedGeneration = 2, failures = [] } = {}) {
  const gate = barrier()
  let generation = 0
  manager.register(business.adaptGameplayDefinition(business.defineGameplay({
    name: 'bonus_rebuild',
    async setup(ctx) {
      const current = ++generation
      if (phase === 'setup' && current === pausedGeneration) { gate.enter(); await gate.wait }
      if (failures.includes(current)) throw new Error('setup failed')
      ctx.track(ctx.core.bonuses.registerProvider(() => ({ source: 'test', type: 'gold', modifier: 1 }), { id: 'test:rebuild', types: ['gold'] }))
      return { generation: current }
    },
    async ready(service) {
      if (phase === 'ready' && service.generation === pausedGeneration) { gate.enter(); await gate.wait }
    },
    commands: { read: { triggers: ['bonus-rebuild'], run: () => 'ok' } },
  })))
  await manager.start()
  const user = await core.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'bonus-rebuild', scope: 'global' }, core.faiths.all()[0].name, 100)
  const scope = core.createBusinessScope('bonus_payer')
  const reward = (key, callbacks = []) => scope.transaction.run(user.uid, async tx => {
    tx.afterCommit(() => callbacks.push('commit'))
    tx.afterRollback(() => callbacks.push('rollback'))
    await tx.users.change({ gold: -1 })
    await tx.data.set({ private: { claimed: key } })
    return tx.economy.reward({ gold: 10 })
  }, { idempotencyKey: key, source: 'test.reward' })
  return { gate, user, reward }
}

for (const phase of ['setup', 'ready']) {
  test(`default rebuild rejects partial rewards throughout asynchronous ${phase}, then permits the same event to retry`, { timeout: 10000 }, async () => {
    await host(async (manager, core, database) => {
      const { gate, user, reward } = await fixture(manager, core, { phase })
      assert.equal((await reward('baseline')).applied.gold, 20)
      const before = await core.users.require(user.uid)
      const ledger = await database.get('faith_core_ledger', { uid: user.uid })
      const data = await database.get('faith_core_business', { uid: user.uid, business: 'bonus_payer' })
      const reloading = manager.reload('bonus_rebuild')
      await gate.started
      try {
        assert.equal(core.bonuses.listProviders().filter(provider => provider.id === 'test:rebuild').length, phase === 'setup' ? 0 : 1)
        const callbacks = []
        await assert.rejects(reward('retryable', callbacks), error => error.code === 'MODULE_NOT_READY')
        assert.deepEqual(callbacks, ['rollback'])
        assert.equal((await core.users.require(user.uid)).gold, before.gold)
        assert.deepEqual(await database.get('faith_core_ledger', { uid: user.uid }), ledger)
        assert.deepEqual(await database.get('faith_core_business', { uid: user.uid, business: 'bonus_payer' }), data)
        assert.deepEqual(await database.get('faith_core_transactions', { idempotency_key: 'retryable' }), [])
        await assert.rejects(core.economy.reward(user.uid, { gold: 10 }, { source: 'test.reward' }), error => error.code === 'MODULE_NOT_READY')
        await assert.rejects(core.users.change(user.uid, { gold: 10 }), error => error.code === 'MODULE_NOT_READY')
        // A gold-only transition does not stall independent currencies or a zero-base calculation.
        assert.equal((await core.economy.reward(user.uid, { ascension_score: 10 }, { source: 'test.unaffected' })).applied.ascension_score, 10)
        assert.equal((await core.bonuses.calculate({ uid: user.uid, type: 'gold', baseValue: 0 })).finalValue, 0)
      } finally { gate.release(); await reloading }
      assert.equal((await reward('retryable')).applied.gold, 20)
      assert.equal((await core.users.require(user.uid)).gold, before.gold + 19)
    })
  })
}

test('the bonus obligation survives failed setup until the previous generation is restored', { timeout: 10000 }, async () => {
  await host(async (manager, core) => {
    const { gate, reward } = await fixture(manager, core, { pausedGeneration: 3, failures: [2] })
    const reloading = assert.rejects(manager.reload('bonus_rebuild'), error => error.details.rollbackFailed === false)
    await gate.started
    try {
      assert.equal(core.bonuses.listProviders().filter(provider => provider.id === 'test:rebuild').length, 0)
      await assert.rejects(reward('recovery'), error => error.code === 'MODULE_NOT_READY')
    } finally { gate.release(); await reloading }
    assert.equal(manager.registry.requireRuntime('bonus_rebuild').state, 'ready')
    assert.equal((await reward('recovery')).applied.gold, 20)
  })
})

test('failed recovery keeps rewards closed until the module is deliberately disabled or rebuilt', async () => {
  await host(async (manager, core) => {
    const { reward } = await fixture(manager, core, { pausedGeneration: -1, failures: [2, 3] })
    await assert.rejects(manager.reload('bonus_rebuild'), error => error.details.rollbackFailed === true)
    assert.equal(manager.registry.requireRuntime('bonus_rebuild').state, 'failed')
    assert.equal(core.bonuses.listProviders().filter(provider => provider.id === 'test:rebuild').length, 0)
    await assert.rejects(reward('failed'), error => error.code === 'MODULE_NOT_READY')
    await manager.disable('bonus_rebuild')
    assert.equal((await reward('disabled')).applied.gold, 10)
    await manager.enable('bonus_rebuild')
    assert.equal((await reward('failed')).applied.gold, 20)
  })
})

test('already admitted tasks can finish their own bonus calculations while reload drains them', { timeout: 10000 }, async () => {
  await host(async (manager, core) => {
    const gate = barrier()
    manager.register(business.defineAdvancedGameplay({
      name: 'admitted_bonus',
      init(ctx) {
        ctx.core.lifecycle.track(ctx.core.bonuses.registerProvider(() => ({ source: 'test', type: 'gold', modifier: 1 }), { id: 'test:admitted', types: ['gold'] }))
        ctx.provide('default', { async work(uid) { gate.enter(); await gate.wait; return ctx.core.bonuses.calculate({ uid, type: 'gold', baseValue: 10 }) } })
      },
      reload() {},
    }))
    await manager.start()
    const user = await core.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'admitted-bonus', scope: 'global' }, core.faiths.all()[0].name, 100)
    const api = manager.interfaces.use('test', 'admitted_bonus', 'default', new Set(['admitted_bonus']))
    const running = api.work(user.uid)
    await gate.started
    const reloading = manager.reload('admitted_bonus')
    try {
      assert.equal(manager.registry.requireRuntime('admitted_bonus').state, 'reloading')
      gate.release()
      assert.equal((await running).finalValue, 20)
      await reloading
    } finally { gate.release() }
  })
})
