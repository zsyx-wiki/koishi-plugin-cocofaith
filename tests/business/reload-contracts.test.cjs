const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const core = require('../../lib/core/index.js')
const business = require('../../lib/business/index.js')

async function host(run) {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  await app.start()
  const manager = new business.BusinessModuleManager({ modules: {} }, app.faithCore, () => {})
  try { await run(manager, app.faithCore) }
  finally { await manager.shutdown(); await app.stop() }
}

test('default gameplay rebuild redeclares its table and recovers after failed ready or schema changes', async () => {
  await host(async (manager) => {
    let generation = 0
    const module = business.adaptGameplayDefinition(business.defineGameplay({
      name: 'table_probe',
      setup(ctx) {
        ctx.core.registerTable({ key: 'string', value: ctx.config.changeSchema ? 'integer' : 'string' }, { primary: 'key' })
        ctx.provide('default', { generation: ++generation, table: ctx.core.table })
        return { fail: ctx.config.fail }
      },
      ready(service) { if (service.fail) throw new Error('ready failed') },
      commands: { read: { triggers: ["table-probe"], run: () => "ok" } },
    }))
    manager.register(module)
    await manager.start()
    const use = () => manager.interfaces.use('table_probe', 'table_probe', 'default', new Set())
    await use().table.create({ key: 'saved', value: 'persisted' })
    await manager.reload('table_probe')
    assert.equal(use().generation, 2)
    assert.equal((await use().table.get({ key: 'saved' }))[0].value, 'persisted')
    await assert.rejects(manager.reload('table_probe', { fail: true }), /reload 失败/)
    assert.equal(manager.registry.requireRuntime('table_probe').state, 'ready')
    assert.equal(use().generation, 4)
    await assert.rejects(manager.reload('table_probe', { changeSchema: true }), /reload 失败/)
    assert.equal(manager.registry.requireRuntime('table_probe').state, 'ready')
    assert.equal((await use().table.get({ key: 'saved' }))[0].value, 'persisted')
  })
})

test('consumers and captured methods follow provider generations through reload and failed reload recovery', async () => {
  await host(async manager => {
    let generation = 0, consumerSetups = 0, cached, captured, nested
    manager.register(business.adaptGameplayDefinition(business.defineGameplay({
      name: 'provider_probe',
      setup(ctx) {
        const service = { generation: ++generation, disposed: false,
          read() { if (this.disposed) throw new Error('disposed instance'); return this.generation } }
        ctx.provide('default', { read: () => service.read(), nested: { read: () => service.read() } })
        return { service, fail: ctx.config.fail }
      },
      ready({ fail }) { if (fail) throw new Error('ready failed') },
      dispose({ service }) { service.disposed = true },
      commands: { read: { triggers: ['provider-read'], run: () => 'ok' } },
    })))
    manager.register(business.defineAdvancedGameplay({
      name: 'consumer_probe', dependencies: ['provider_probe'],
      init(ctx) {
        consumerSetups++
        cached = ctx.use('provider_probe')
        captured = cached.read
        nested = cached.nested.read
      },
    }))
    await manager.start()
    assert.equal(cached.read(), 1)
    await manager.reload('provider_probe')
    assert.equal(cached.read(), 2)
    assert.equal(captured(), 2)
    assert.equal(nested(), 2)
    assert.equal(consumerSetups, 1)
    await assert.rejects(manager.reload('provider_probe', { fail: true }))
    assert.equal(captured(), 4)
    assert.equal(nested(), 4)
    await manager.disable('provider_probe', true)
    assert.throws(captured, error => error.code === 'INTERFACE_NOT_FOUND')
    await manager.enable('consumer_probe')
    assert.equal(captured(), 5)
  })
})
