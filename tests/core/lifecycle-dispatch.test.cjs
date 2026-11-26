const test = require('node:test')
const assert = require('node:assert/strict')
const { FaithLifecycleService } = require('../../lib/core/index.js')

function lifecycle() {
  return new FaithLifecycleService({ on() {}, logger: () => ({ debug() {}, error() {} }) })
}

for (const stage of ['init', 'ready', 'reload', 'game-day', 'dispose']) {
  test(`${stage} skips a snapshotted callback unregistered by an earlier callback`, async () => {
    const service = lifecycle(), calls = []
    if (['reload', 'game-day', 'dispose'].includes(stage)) await service.ready()
    service.on(stage, async () => { calls.push('first'); await old.dispose() }, { priority: -1 })
    const old = service.on(stage, () => { calls.push('disposed') })
    if (stage === 'init') await service.init()
    if (stage === 'ready') await service.ready()
    if (stage === 'reload') await service.reload()
    if (stage === 'game-day') await service.dispatchGameDay({ date: '2026-11-26', previousDate: null, triggeredAt: new Date(), source: 'manual' })
    if (stage === 'dispose') await service.dispose()
    assert.deepEqual(calls, ['first'])
    await service.dispose()
  })
}

test('new reload callbacks join the next dispatch while the current snapshot keeps its order', async () => {
  const service = lifecycle(), calls = []
  await service.ready()
  let swapped = false
  service.onReload(async () => {
    calls.push('first')
    if (swapped) return
    swapped = true
    await old.dispose()
    service.onReload(() => calls.push('new'), { priority: 5 })
  }, { priority: -1 })
  const old = service.onReload(() => calls.push('old'), { priority: 5 })
  service.onReload(() => calls.push('last'), { priority: 10 })
  await service.reload()
  assert.deepEqual(calls, ['first', 'last'])
  await service.reload()
  assert.deepEqual(calls, ['first', 'last', 'first', 'new', 'last'])
  await service.dispose()
})
