const test = require('node:test')
const assert = require('node:assert/strict')
const { BusinessInterfaceRegistry, BusinessContributionRegistry } = require('../../lib/business/index.js')

test('stale interface disposers cannot remove a replacement after provider removal or clear', async () => {
  for (const reset of [registry => registry.removeProvider('provider'), registry => registry.clear()]) {
    const registry = new BusinessInterfaceRegistry()
    const old = registry.provide('provider', 'default', { read: () => 'old' })
    reset(registry)
    const current = registry.provide('provider', 'default', { read: () => 'new' })
    await old.dispose()
    assert.equal(registry.use('consumer', 'provider', 'default', new Set(['provider'])).read(), 'new')
    assert.equal(registry.list().length, 1)
    // Provider index must also still own the new entry.
    registry.removeProvider('provider')
    assert.equal(registry.list().length, 0)
    await current.dispose()
  }
})

test('stale contribution disposers cannot remove a rebuilt slot or invalidate its cache', async () => {
  const registry = new BusinessContributionRegistry(() => {})
  const old = registry.register('provider', 'probe.slot', () => 'old', { id: 'probe' })
  registry.clear()
  const current = registry.register('provider', 'probe.slot', () => 'new', { id: 'probe' })
  assert.deepEqual((await registry.collect('probe.slot', {})).results, ['new'])
  await old.dispose()
  assert.deepEqual((await registry.collect('probe.slot', {})).results, ['new'])
  await current.dispose()
  assert.deepEqual((await registry.collect('probe.slot', {})).results, [])
})
