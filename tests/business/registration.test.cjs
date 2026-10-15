const test = require('node:test')
const assert = require('node:assert/strict')
const business = require('../../lib/business/index.js')

function setupRegistrationCommand() {
  const faith = { name: '真理' }
  let registered
  const core = {
    faiths: {
      get: (name) => name === faith.name ? faith : undefined,
      all: () => [faith],
      registerUser: async (identity, name) => {
        registered = { identity, name }
        return { uid: 10000000, faiths: [name], gold: 1000 }
      },
    },
  }
  const module = business.createFaithModule()
  module.init({ name: 'faith', core, config: module.defaultConfig, provide() {} })
  const command = module.commands[0].children.find((item) => item.id === 'register')
  return { command, core, get registered() { return registered } }
}

test('registration follows the adapter capability instead of its platform name', async () => {
  const fixture = setupRegistrationCommand()
  const identity = { adapter: 'onebot', type: 'qq_account', value: '123456', scope: 'global' }
  const context = {
    uid: null,
    args: ['真理'],
    event: { uid: null, identity, scene: 'group', content: '信仰 注册 真理', adapter: { name: 'OneBot', version: 'test', allowRegistration: false } },
    core: fixture.core,
    config: {},
  }
  await assert.rejects(() => fixture.command.execute(context), (error) => error.code === 'NOT_ALLOWED')
  await fixture.command.execute({ ...context, event: { ...context.event, adapter: { ...context.event.adapter, allowRegistration: true } } })
  assert.deepEqual(fixture.registered, { identity, name: '真理' })
})
