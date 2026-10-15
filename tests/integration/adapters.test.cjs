const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const sqlite = require('@minatojs/driver-sqlite').default
const main = require('../../lib/index.js')
const { provideFaithAdapter } = require('cocofaith-sdk/adapter')

async function settle(app) {
  await app.events.flush()
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve))
  await app.events.flush()
}
function adapter(platform) {
  return { name: `fixture-${platform}`, apply(ctx) {
    provideFaithAdapter(ctx, { id: platform, name: platform, platform, version: '1', mode: 'normal' })
    ctx.inject(['faithCore', 'faithBusiness'], ctx => { ctx.middleware((_session, next) => next()) })
  } }
}

test('main only requires the faithAdapter service, without a particular adapter plugin', async () => {
  const manifest = require('../../package.json')
  assert.deepEqual(main.inject, ['database', 'faithAdapter'])
  assert.deepEqual(manifest.koishi.service.required, ['database', 'faithAdapter'])
  const app = new App()
  app.plugin(sqlite, { path: ':memory:' })
  // 自定义实现不需要使用 SDK 注册器，也不需要特定的平台适配器包。
  app.set('faithAdapter', { list: () => [], has: () => false })
  app.plugin(main, { core: { gameDay: { enabled: false } } })
  try {
    await app.start()
    assert.equal(app.faithCore.lifecycle.state, 'ready')
    assert.equal(app.faithBusiness.status('junk').state, 'ready')
  } finally {
    await app.stop()
  }
})

test('main waits for an adapter; two providers share one service and last removal suspends main', async () => {
  const app = new App()
  app.plugin(sqlite, { path: ':memory:' })
  app.plugin(main, { core: { gameDay: { enabled: false } } })
  await app.start()
  assert.equal(app.faithCore, undefined)
  assert.equal(app.faithAdapter, undefined)
  const baseline = app.$processor._hooks.length
  const qqPlugin = adapter('qq'), onebotPlugin = adapter('onebot')
  let qq = app.plugin(qqPlugin)
  await settle(app)
  assert.equal(app.faithCore.lifecycle.state, 'ready')
  const registry = app.faithAdapter
  const onebot = app.plugin(onebotPlugin)
  await settle(app)
  assert.equal(app.faithAdapter, registry)
  assert.deepEqual(registry.list().map(info => info.platform).sort(), ['onebot', 'qq'])
  assert.equal(registry.has('qq'), true)
  assert.equal(app.$processor._hooks.length, baseline + 2)
  const firstCore = app.faithCore
  qq.dispose()
  await settle(app)
  assert.equal(app.faithAdapter, registry)
  assert.equal(registry.has('qq'), false)
  assert.equal(app.faithCore.lifecycle, firstCore.lifecycle)
  assert.equal(app.$processor._hooks.length, baseline + 1)
  qq = app.plugin(qqPlugin)
  await settle(app)
  onebot.dispose()
  await settle(app)
  assert.equal(app.faithCore.lifecycle, firstCore.lifecycle)
  assert.equal(registry.has('qq'), true)
  assert.equal(registry.has('onebot'), false)
  qq.dispose()
  await settle(app)
  assert.equal(app.faithAdapter, undefined)
  assert.equal(app.faithCore, undefined)
  assert.equal(app.faithBusiness, undefined)
  assert.equal(firstCore.lifecycle.state, 'disposed')
  assert.equal(app.$processor._hooks.length, baseline)
  const again = app.plugin(onebotPlugin)
  await settle(app)
  assert.equal(app.faithCore.lifecycle.state, 'ready')
  assert.equal(app.faithAdapter.has('onebot'), true)
  again.dispose()
  await settle(app)
  await app.stop()
})
