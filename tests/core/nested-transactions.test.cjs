const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const core = require('../../lib/core/index.js')

test('nested business transactions reject before locks, writes and callbacks; runMany remains atomic', { timeout: 10000 }, async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  await app.start()
  try {
    const users = []
    for (const value of ['nested-a', 'nested-b']) {
      users.push(await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value, scope: 'global' }, app.faithCore.faiths.all()[0].name, 100))
    }
    const scope = app.faithCore.createBusinessScope('nest_probe')
    const [a, b] = users.map(user => user.uid)
    const events = []
    const nested = uid => scope.transaction.run(uid, async tx => {
      events.push('inner entered')
      tx.afterCommit(() => events.push('inner commit'))
      tx.afterRollback(() => events.push('inner rollback'))
      await tx.users.change({ gold: 50 })
      throw new Error('inner failed')
    })
    await assert.rejects(scope.transaction.run(a, async tx => {
      tx.afterCommit(() => events.push('outer commit'))
      tx.afterRollback(() => events.push('outer rollback'))
      await tx.users.change({ gold: 10 })
      await nested(b)
    }), /不支持嵌套事务/)
    assert.deepEqual(events, ['outer rollback'])
    assert.equal((await app.faithCore.users.require(a)).gold, 100)
    assert.equal((await app.faithCore.users.require(b)).gold, 100)

    events.length = 0
    await scope.transaction.run(a, async tx => {
      tx.afterCommit(() => events.push('outer commit'))
      // Both a same-UID and a different-UID nested call must fail promptly.
      await assert.rejects(nested(a), /runMany/)
      await assert.rejects(nested(b), /runMany/)
      await tx.users.change({ gold: 10 })
    })
    assert.deepEqual(events, ['outer commit'])
    assert.equal((await app.faithCore.users.require(a)).gold, 110)
    assert.equal((await app.faithCore.users.require(b)).gold, 100)

    await assert.rejects(scope.transaction.runMany([a, b], async txs => {
      await txs.get(a).users.change({ gold: -10 })
      await txs.get(b).users.change({ gold: 10 })
      throw new Error('abort all')
    }), /abort all/)
    assert.equal((await app.faithCore.users.require(a)).gold, 110)
    assert.equal((await app.faithCore.users.require(b)).gold, 100)
    await scope.transaction.runMany([a, b], async txs => {
      await txs.get(a).users.change({ gold: -10 })
      await txs.get(b).users.change({ gold: 10 })
    })
    assert.equal((await app.faithCore.users.require(a)).gold, 100)
    assert.equal((await app.faithCore.users.require(b)).gold, 110)
  } finally { await app.stop() }
})

test('Core public write entries reject nesting before locks, hooks and bulk-operation side effects', { timeout: 10000 }, async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  await app.start()
  try {
    const service = app.faithCore
    const faiths = service.faiths.all()
    const identity = { adapter: 'onebot', type: 'qq_account', value: 'public-writes', scope: 'global' }
    const user = await service.faiths.registerUser(identity, faiths[0].name, 100)
    const other = await service.faiths.registerUser({ ...identity, value: 'public-writes-other' }, faiths[0].name, 100)
    const scope = service.createBusinessScope('public_writes')
    const item = service.items.all().find(item => !item.max_quantity || item.max_quantity >= 10).item_id
    await service.items.give(user.uid, item, 2)
    let hooks = 0, bonuses = 0
    service.hooks.on('user/before-values-change', value => { hooks++; return value })
    service.hooks.on('identity/before-bind', () => { hooks++ })
    service.hooks.on('identity/before-create-user', () => { hooks++ })
    service.bonuses.registerProvider(() => { bonuses++; return [] }, { id: 'test:no-side-effects' })
    const writes = [
      ['change', () => service.users.change(user.uid, { gold: 1 })],
      ['setStatus', () => service.users.setStatus(user.uid, 'disabled')],
      ['setFaiths', () => service.users.setFaiths(user.uid, [faiths[1].name])],
      ['replaceCurrentFaith', () => service.users.replaceCurrentFaith(user.uid, faiths[1].name)],
      ['abandonFaith', () => service.users.abandonFaith(user.uid, faiths[1].name)],
      ['give', () => service.items.give(user.uid, item, 1)],
      ['take', () => service.items.take(user.uid, item, 1)],
      ['setQuantity', () => service.items.setQuantity(user.uid, item, 1)],
      ['giveMany', () => service.items.giveMany(user.uid, { [item]: 1 })],
      ['takeMany', () => service.items.takeMany(user.uid, { [item]: 1 })],
      ['transferItem', () => service.items.transfer(user.uid, other.uid, item, 1)],
      ['setProfession', () => service.professions.setUserProfession(user.uid, null)],
      ['bind', () => service.adapter.bind(user.uid, { ...identity, value: 'must-not-bind' })],
      ['unbind', () => service.unbindIdentity(user.uid, identity)],
      ['registerUser', () => service.faiths.registerUser({ ...identity, value: 'must-not-register' }, faiths[0].name)],
      ['dynamicFaith', () => service.faiths.registerDynamic({ name: 'must-not-create', path: '生命', creatorUid: user.uid })],
      ['unregisterDynamic', () => service.faiths.unregisterDynamic('unused', user.uid)],
      ['prayerWord', () => service.faiths.setPrayerWord('unused', 'unused', user.uid)],
      ['customProfession', () => service.faiths.setCustomProfession('unused', 'unused', 'unused', user.uid)],
      ['dataGet', () => scope.data.get(user.uid)],
      ['dataSet', () => scope.data.set(user.uid, { private: { count: 1 } })],
      ['pay', () => service.economy.pay(user.uid, { gold: 1 }, { source: 'test.pay' })],
      ['reward', () => service.economy.reward(user.uid, { gold: 1 }, { source: 'test.reward' })],
      ['refund', () => service.economy.refund(user.uid, { gold: 1 }, { source: 'test.refund' })],
      ['transferGold', () => service.economy.transfer(user.uid, other.uid, { gold: 1 }, { source: 'test.transfer' })],
      ['bulkValues', () => service.bulk.changeValuesForAll({ gold: 1 }, { operationId: 'must-not-create-values' })],
      ['bulkItems', () => service.bulk.giveItemToAll(item, 1, { operationId: 'must-not-create-items' })],
    ]
    await scope.transaction.run(user.uid, async tx => {
      for (const [name, write] of writes) {
        await assert.rejects(async () => write(), error => error.code === 'CONFLICT' && /不支持嵌套事务/.test(error.message), name)
      }
      await tx.users.change({ gold: 1 }) // Catching rejected misuse must leave the outer transaction usable.
    })
    assert.equal(hooks, 0)
    assert.equal(bonuses, 0)
    assert.equal((await service.users.require(user.uid)).gold, 101)
    assert.equal(await service.items.getQuantity(user.uid, item), 2)
    assert.deepEqual(await app.database.get('faith_core_bulk_operations', {}), [])
    await service.users.change(user.uid, { gold: 1 }, { isFixed: true })
    assert.equal((await service.users.require(user.uid)).gold, 102)
    await service.items.give(user.uid, item, 1)
    assert.equal(await service.items.getQuantity(user.uid, item), 3)
  } finally { await app.stop() }
})
