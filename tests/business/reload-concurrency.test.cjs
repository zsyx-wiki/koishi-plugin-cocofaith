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

test('reloading bonus providers abort the whole reward transaction and allow retry after reload', { timeout: 10000 }, async () => {
  await host(async (manager, core, database) => {
    const gate = barrier()
    manager.register(business.defineAdvancedGameplay({
      name: 'bonus_reload',
      init(ctx) {
        ctx.core.lifecycle.track(ctx.core.bonuses.registerProvider(() => ({ source: 'test', type: 'gold', modifier: 1 }), { id: 'test:reload', types: ['gold'] }))
      },
      async reload() { gate.enter(); await gate.wait },
    }))
    await manager.start()
    const user = await core.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'bonus-reload', scope: 'global' }, core.faiths.all()[0].name, 100)
    const scope = core.createBusinessScope('reward_probe')
    const reward = (key, callbacks = []) => scope.transaction.run(user.uid, async tx => {
      tx.afterCommit(() => callbacks.push('commit'))
      tx.afterRollback(() => callbacks.push('rollback'))
      await tx.users.change({ gold: -1 })
      return tx.economy.reward({ gold: 10 })
    }, { idempotencyKey: key, source: 'test.reward' })
    assert.equal((await reward('baseline')).applied.gold, 20)
    const before = await core.users.require(user.uid)
    const ledger = await database.get('faith_core_ledger', { uid: user.uid })
    const reloading = manager.reload('bonus_reload')
    await gate.started
    try {
      const callbacks = []
      await assert.rejects(reward('retryable', callbacks), error => error.code === 'MODULE_NOT_READY')
      assert.deepEqual(callbacks, ['rollback'])
      assert.equal((await core.users.require(user.uid)).gold, before.gold)
      assert.deepEqual(await database.get('faith_core_ledger', { uid: user.uid }), ledger)
      await assert.rejects(core.economy.reward(user.uid, { gold: 10 }, { source: 'test.reward' }), error => error.code === 'MODULE_NOT_READY')
      await assert.rejects(core.users.change(user.uid, { gold: 10 }), error => error.code === 'MODULE_NOT_READY')
    } finally { gate.release(); await reloading }
    assert.equal((await reward('retryable')).applied.gold, 20)
    assert.equal((await core.users.require(user.uid)).gold, before.gold + 19)
  })
})

test('calculation hooks and contributions propagate lifecycle rejection while ordinary failures remain isolated', async () => {
  await host(async (manager, core) => {
    const gate = barrier()
    manager.register(business.defineAdvancedGameplay({
      name: 'calculation_reload',
      init(ctx) {
        ctx.provide('default', { prepare: request => request })
        ctx.contribute('test.calculation', () => 2, { id: 'probe' })
      },
      async reload() { gate.enter(); await gate.wait },
    }))
    await manager.start()
    const user = await core.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'hook-reload', scope: 'global' }, core.faiths.all()[0].name, 100)
    const api = manager.interfaces.use('test', 'calculation_reload', 'default', new Set(['calculation_reload']))
    core.hooks.on('bonus/before-calculate', request => api.prepare(request))
    const request = { uid: user.uid, type: 'gold', baseValue: 10 }
    const reloading = manager.reload('calculation_reload')
    await gate.started
    try {
      await assert.rejects(core.bonuses.calculate(request), error => error.code === 'MODULE_NOT_READY')
      await assert.rejects(manager.contributions.collect('test.calculation', {}), error => error.code === 'MODULE_NOT_READY')
    } finally { gate.release(); await reloading }
    assert.equal((await core.bonuses.calculate(request)).finalValue, 10)
    const faulty = core.bonuses.registerProvider(() => { throw new Error('ordinary failure') }, { id: 'test:fault' })
    const result = await core.bonuses.calculate(request)
    assert.equal(result.finalValue, 10)
    assert.equal(result.failures.length, 1)
    await faulty.dispose()
  })
})

test('Core reload skips old gameplay lifecycle closures after Business rebuilds the service', async () => {
  await host(async (manager, core) => {
    let generation = 0
    const events = []
    core.lifecycle.onReload(() => manager.reload(), { priority: -100 })
    manager.register(business.adaptGameplayDefinition(business.defineGameplay({
      name: 'snapshot_probe',
      setup(ctx) {
        const service = { generation: ++generation, disposed: false }
        events.push(`setup:${service.generation}`)
        ctx.core.lifecycle.onReload(() => {
          assert.equal(service.disposed, false)
          events.push(`reload:${service.generation}`)
        })
        return service
      },
      dispose(service) { service.disposed = true; events.push(`dispose:${service.generation}`) },
      commands: { read: { triggers: ['snapshot-probe'], run: () => 'ok' } },
    })))
    await manager.start()
    await core.lifecycle.reload()
    assert.deepEqual(events, ['setup:1', 'dispose:1', 'setup:2'])
    await core.lifecycle.reload()
    assert.deepEqual(events, ['setup:1', 'dispose:1', 'setup:2', 'dispose:2', 'setup:3'])
    assert.equal(manager.registry.requireRuntime('snapshot_probe').state, 'ready')
  })
})
