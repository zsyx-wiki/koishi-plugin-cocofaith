const test = require('node:test')
const assert = require('node:assert/strict')
const business = require('../../lib/business/index.js')

const command = (id, ...commands) => ({ id, commands, execute: async () => ({ type: 'silent' }) })

test('failed duplicate module registration preserves original commands and routing', () => {
  const manager = new business.BusinessModuleManager({}, {}, () => {})
  const original = { name: 'probe', commands: [command('old', '原命令')] }
  manager.register(original)
  assert.throws(() => manager.register({ name: 'probe', commands: [command('new', '新命令')] }), { code: 'MODULE_EXISTS' })
  assert.equal(manager.registry.modules.get('probe'), original)
  assert.equal(manager.commands.resolve({ scene: 'group', content: '原命令' }).commandId, 'old')
  assert.equal(manager.commands.resolve({ scene: 'group', content: '新命令' }), null)
})

test('repeated token parsing preserves quoted arguments, escapes and slash prefixes', () => {
  const router = new business.BusinessCommandRouter()
  const root = { ...command('root', 'ROOT', 'alias'), children: [command('child', '子命令')] }
  router.register('probe', [root])
  for (let i = 0; i < 20; i++) {
    assert.equal(router.acceptsCommand(' /ROOT 子命令 "a b"'), true)
    assert.equal(router.acceptsCommand('普通聊天'), false)
    const match = router.resolve({ scene: 'group', content: '/root 子命令 "a b" \'c d\' "a\\\"b"' })
    assert.equal(match.commandId, 'root.child')
    assert.deepEqual(match.args, ['a b', 'c d', 'a"b'])
    assert.deepEqual(business.tokenize(''), [])
  }
  assert.deepEqual(router.list(), [{ business: 'probe', command: root }])
})
