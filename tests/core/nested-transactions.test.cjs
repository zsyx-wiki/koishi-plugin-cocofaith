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
