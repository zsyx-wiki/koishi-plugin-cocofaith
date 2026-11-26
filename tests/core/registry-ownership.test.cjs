const test = require('node:test')
const assert = require('node:assert/strict')
const core = require('../../lib/core/index.js')
const ctx = { logger: () => ({ error() {} }), database: { get: async () => [] } }

for (const reset of ['removeProvider', 'removeOwner', 'clear']) {
  test(`bonus disposers cannot delete a replacement after ${reset}`, async () => {
    const hooks = new core.FaithHooksService(ctx)
    const bonuses = new core.FaithBonusService({ require: async uid => ({ uid, faiths: [] }) }, hooks)
    const old = bonuses.registerProvider(() => ({ source: 'old', type: 'gold', modifier: 2 }), { id: 'same', owner: 'old' })
    if (reset === 'removeProvider') bonuses.removeProvider('same')
    if (reset === 'removeOwner') bonuses.removeOwner('old')
    if (reset === 'clear') bonuses.clear()
    const current = bonuses.registerProvider(() => ({ source: 'new', type: 'gold', modifier: 1 }), { id: 'same', owner: 'new' })
    const request = { uid: 10000000, type: 'gold', baseValue: 10 }
    assert.equal((await bonuses.calculate(request)).finalValue, 20) // Populate the ordered cache.
    await old.dispose()
    assert.equal(bonuses.size, 1)
    assert.equal((await bonuses.calculate(request)).finalValue, 20)
    await current.dispose()
    assert.equal(bonuses.size, 0)
    assert.equal((await bonuses.calculate(request)).finalValue, 10)
  })
}

for (const reset of ['off', 'removeOwner', 'clear']) {
  test(`Hook disposers cannot delete a replacement after ${reset}`, async () => {
    const hooks = new core.FaithHooksService(ctx)
    const old = hooks.on('test/reuse', () => 'old', { id: 'same', owner: 'old' })
    if (reset === 'off') hooks.off('test/reuse', 'same')
    if (reset === 'removeOwner') hooks.removeOwner('old')
    if (reset === 'clear') hooks.clear()
    const current = hooks.on('test/reuse', () => 'new', { id: 'same', owner: 'new' })
    await hooks.emit('test/reuse', null) // Populate the ordered cache.
    await old.dispose()
    assert.equal(hooks.count('test/reuse'), 1)
    assert.deepEqual((await hooks.emit('test/reuse', null)).results, ['new'])
    await current.dispose()
    assert.equal(hooks.count('test/reuse'), 0)
  })
}

for (const reset of ['removeOwner', 'clear']) {
  test(`permission disposers cannot delete a rebuilt policy set after ${reset}`, async () => {
    const permissions = new core.FaithPermissionsService(ctx)
    const old = permissions.register('test.reuse', () => false, { owner: 'old' })
    if (reset === 'removeOwner') permissions.removeOwner('old')
    else permissions.clear()
    const current = permissions.register('test.reuse', () => true, { owner: 'new' })
    await old.dispose()
    assert.equal(permissions.countPolicies(), 1)
    assert.equal(await permissions.check(10000000, 'test.reuse'), true)
    await current.dispose()
    assert.equal(permissions.countPolicies(), 0)
  })
}

for (const mode of ['emit', 'waterfall', 'waterfallStrict']) {
  test(`${mode} skips a removed snapshot record without invoking its replacement in the same round`, async () => {
    const hooks = new core.FaithHooksService(ctx)
    hooks.on('test/snapshot', async value => {
      await old.dispose()
      hooks.on('test/snapshot', input => input + 10, { id: 'same' })
      return value + 1
    }, { priority: -1, once: true })
    const old = hooks.on('test/snapshot', value => { throw new Error('old closure executed') }, { id: 'same', once: true })
    if (mode === 'emit') {
      const result = await hooks.emit('test/snapshot', 1)
      assert.equal(result.invoked, 1)
      assert.deepEqual(result.results, [2])
      assert.deepEqual(result.failures, [])
      assert.deepEqual((await hooks.emit('test/snapshot', 1)).results, [11])
    } else {
      assert.equal(await hooks[mode]('test/snapshot', 1), 2)
      assert.equal(await hooks[mode]('test/snapshot', 1), 11)
    }
  })
}

for (const reset of ['removeOwner', 'clear']) {
  test(`a stale transition disposer cannot release a replacement guard after ${reset}`, async () => {
    const bonuses = new core.FaithBonusService({ require: async uid => ({ uid, faiths: [] }) }, new core.FaithHooksService(ctx))
    const unavailable = () => { throw Object.assign(new Error('reloading'), { code: 'MODULE_NOT_READY' }) }
    const register = () => bonuses.registerProvider(() => ({ source: 'test', type: 'gold', modifier: 1 }), { id: 'same', owner: 'same' })
    register()
    const old = bonuses.suspendOwner('same', unavailable)
    if (reset === 'clear') bonuses.clear()
    else bonuses.removeOwner('same')
    register()
    const current = bonuses.suspendOwner('same', unavailable)
    await old.dispose()
    const request = { uid: 10000000, type: 'gold', baseValue: 10 }
    await assert.rejects(bonuses.calculate(request), error => error.code === 'MODULE_NOT_READY')
    await current.dispose()
    assert.equal((await bonuses.calculate(request)).finalValue, 20)
  })
}
