const test = require('node:test')
const assert = require('node:assert/strict')
const business = require('../../lib/business/index.js')
const businessVersion = require('../../package.json').version

test('about command reports the merged package and adapter versions and permits unregistered users', async () => {
  const command = business.createAboutModule().commands[0]
  assert.equal(command.allowUnregistered, true)
  const result = await command.execute({ event: { uid: null, scene: 'group', content: '关于椰子水', adapter: { name: 'CoCoFaith Adapter Test', version: '1.2.3' } } })
  assert.equal(result.type, 'text')
  assert.match(result.content, /^关于椰子水/m)
  assert.match(result.content, /Koishi：v\d+/)
  assert.ok(result.content.includes(`CoCoFaith：v${businessVersion}`))
  assert.match(result.content, /消息适配：CoCoFaith Adapter Test v1\.2\.3/)
  assert.doesNotMatch(result.content, /Core：|Business：/)

})

test('Business protocol validates and preserves adapter metadata', () => {
  const identity = { adapter: 'qqbot', type: 'qqbot_member_openid', value: 'member', scope: 'group_chat', scopeValue: 'group' }
  const core = { adapter: { normalize: (value) => value } }
  const event = business.normalizeBusinessEvent(core, {
    uid: null, identity, scene: 'group', content: '关于椰子水', adapter: { name: ' CoCoFaith Adapter QQ ', version: ' 3.0.0-alpha.2 ' },
  })
  assert.deepEqual(event.adapter, { name: 'CoCoFaith Adapter QQ', version: '3.0.0-alpha.2', allowRegistration: false })
  assert.equal(Object.isFrozen(event.adapter), true)
  assert.throws(() => business.normalizeBusinessEvent(core, { uid: 1, scene: 'group', content: '关于椰子水', adapter: { name: '', version: '1' } }))
})

test('about command handles an adapter without version metadata', async () => {
  const command = business.createAboutModule().commands[0]
  const result = await command.execute({ event: { uid: null, scene: 'group', content: '关于椰子水', identity: { adapter: 'third-party' } } })
  assert.match(result.content, /third-party（版本未知）/)
})
