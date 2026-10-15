const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const core = require('../../lib/core/index.js')
const business = require('../../lib/business/index.js')

test('SDK junk gameplay keeps daily limits, deduplicates events and survives reload', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  app.plugin(business, {})
  await app.start()
  try {
    const identity = { adapter: 'onebot', type: 'qq_account', value: 'sdk-junk-test', scope: 'global' }
    const user = await app.faithCore.faiths.registerUser(identity, app.faithCore.faiths.all()[0].name, 1000)
    await app.faithCore.users.change(user.uid, { ascension_score: 100 })
    const event = { uid: user.uid, identity, scene: 'group', content: '捡垃圾', eventId: 'junk-1' }
    const first = await app.faithBusiness.dispatch(event)
    assert.ok('result' in first)
    const before = await app.faithCore.items.getInventory(user.uid)
    const duplicate = await app.faithBusiness.dispatch(event)
    assert.ok('error' in duplicate)
    assert.deepEqual(await app.faithCore.items.getInventory(user.uid), before)
    await app.faithBusiness.reload('junk')
    const second = await app.faithBusiness.dispatch({ ...event, eventId: 'junk-2' })
    assert.ok('result' in second)
    assert.equal((await app.faithCore.users.require(user.uid)).gold, 800)
    const third = await app.faithBusiness.dispatch({ ...event, eventId: 'junk-3' })
    assert.equal(third.error.code, 'LIMIT_REACHED')
  } finally { await app.stop() }
})

test('reload drains active executions and blocks commands after unrecoverable cleanup', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  await app.start()
  let runtime
  try {
    let release, entered, disposed = 0, failCleanup = false
    const started = new Promise(resolve => { entered = resolve })
    const barrier = new Promise(resolve => { release = resolve })
    const definition = business.defineGameplay({ name: 'reload_probe',
      setup(context) { context.provide('default', { generation: disposed }); return { generation: disposed } },
      dispose() { disposed++; if (failCleanup) throw new Error('cannot clean') },
      commands: [{ id: 'wait', triggers: ['wait'], async run({ service }) { entered(); await barrier; return String(service.generation) } }],
    })
    const module = business.adaptGameplayDefinition(definition)
    const interfaces = new business.BusinessInterfaceRegistry()
    runtime = new business.BusinessModuleRuntime(module, new business.BusinessConfigStore({ modules: {} }), interfaces,
      new business.BusinessContributionRegistry(() => {}), () => app.faithCore.createBusinessScope('reload_probe'))
    await runtime.start()
    const execute = () => runtime.executeCommand(10000000, { uid: 10000000, scene: 'group', content: 'wait' }, [], ['wait'], module.commands[0].execute)
    const running = execute()
    await started
    const reloading = runtime.reload()
    assert.equal(runtime.state, 'reloading')
    assert.equal(disposed, 0)
    release()
    assert.equal((await running).content, '0')
    await reloading
    assert.equal(disposed, 1)
    assert.equal(interfaces.list().length, 1)
    failCleanup = true
    await assert.rejects(runtime.reload(), /reload 失败/)
    assert.equal(runtime.state, 'failed')
    await assert.rejects(execute(), error => error.code === 'MODULE_NOT_READY')
  } finally {
    if (runtime) await runtime.stop()
    await app.stop()
  }
})
