const test = require('node:test')
const assert = require('node:assert/strict')
const { Schema } = require('koishi')
const main = require('../../lib/index.js')
const business = require('../../lib/business/index.js')

test('console configuration survives schema serialization with defaults and partial input', () => {
  // 与 Koishi 控制台一样，用传输后的 Schema 重建校验器。
  const schema = new Schema(JSON.parse(JSON.stringify(main.Config)))
  for (const input of [{}, { core: {}, business: {} }, {
    business: { container: { config: { maxCapacity: 400 } } },
  }]) {
    assert.deepEqual(schema(structuredClone(input)), main.Config(structuredClone(input)))
  }
  assert.equal(schema({}).business.container.config.maxCapacity, 300)
  assert.throws(() => schema({ business: { container: { config: { maxCapacity: 0 } } } }))
  assert.throws(() => schema({ business: { container: { config: { maxCapacity: 'invalid' } } } }))
})

test('server configuration still rejects invalid cross-field relationships', () => {
  const store = new business.BusinessConfigStore({
    container: { config: { maxCapacity: 100 } },
  })
  const module = business.createBuiltInBusinessModules().find(module => module.name === 'container')
  assert.throws(() => store.resolve(module), error => {
    assert.equal(error.code, 'CONFIG_INVALID')
    assert.equal(error.cause.message, 'manualInfusionMax 不能超过 maxCapacity')
    return true
  })
})
