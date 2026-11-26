const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const core = require('../../lib/core/index.js')

test('public and atomic user writes enforce the same value rules and stable validation errors', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  await app.start()
  try {
    const user = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'shared-mutation', scope: 'global' }, app.faithCore.faiths.all()[0].name, 100)
    const scope = app.faithCore.createBusinessScope('shared_mutation')
    for (const delta of [{}, { unknown: 1 }, { gold: Infinity }, { gold: Number.MAX_SAFE_INTEGER }, { audience_rank: 0.5 }, { abandon_count: -1 }]) {
      for (const write of [
        () => app.faithCore.users.change(user.uid, delta, { isFixed: true }),
        () => scope.transaction.run(user.uid, tx => tx.users.change(delta)),
      ]) {
        await assert.rejects(write(), error => error.code === 'VALIDATION_FAILED')
        assert.equal((await app.faithCore.users.require(user.uid)).gold, 100)
      }
    }
    const delta = { gold: -5, audience_rank: 1, abandon_count: 1 }
    await app.faithCore.users.change(user.uid, delta, { isFixed: true })
    const after = await scope.transaction.run(user.uid, tx => tx.users.change(delta))
    assert.deepEqual([after.gold, after.audience_rank, after.abandon_count], [90, 2, 2])
  } finally { await app.stop() }
})
