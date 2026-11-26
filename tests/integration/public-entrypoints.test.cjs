const test = require('node:test')
const assert = require('node:assert/strict')

test('the gameplay entry has an explicit runtime surface without framework implementations', async () => {
  const api = require('../../lib/gameplay.js')
  const expected = [
    'defineAdvancedGameplay', 'BusinessError',
    'TITLE_API', 'ROOMS_API', 'ROULETTE_API', 'ADMIN_FIELDS_API', 'ADMIN_COMMANDS_API',
    'FAITH_INFO', 'FAITH_BEFORE_ABANDON', 'BINDING_API', 'CLUB_API', 'DAILY_PRAYER_API',
    'VOID_PRAYER_API', 'COLLECTION_API', 'CONTAINER_API', 'FAITH_REGISTRY_API',
  ].sort()
  assert.deepEqual(Object.keys(api).sort(), expected)
  const esm = await import('../../lib/gameplay.mjs')
  assert.deepEqual(Object.keys(esm).sort(), expected)
  const module = api.defineAdvancedGameplay({ name: 'public_probe', commands: { run: { triggers: ['probe'], run: () => 'ok' } } })
  assert.equal((await module.commands[0].execute({})).content, 'ok')
  const old = require('../../lib/business/index.js')
  assert.equal(typeof old.BusinessModuleRuntime, 'function')
  assert.equal(typeof require('../../lib/core/index.js').KeyedLockService, 'function')
})
