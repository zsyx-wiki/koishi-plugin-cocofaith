const test = require('node:test')
const assert = require('node:assert/strict')
const { FaithCoreError } = require('../../lib/core/index.js')
const { FaithGameplayService } = require('../../lib/business/index.js')

test('registration classifies duplicate users by error code rather than translated wording', async () => {
  let error = new FaithCoreError('CONFLICT', 'This account already exists')
  const service = new FaithGameplayService({ faiths: {
    get: () => ({ name: 'test' }), require: () => ({ name: 'test' }),
    registerUser: async () => { throw error },
  } }, {})
  await assert.rejects(service.register({}, 'test'), failure => failure.code === 'CONFLICT')
  error = new Error('已经注册信仰只是普通错误提示')
  await assert.rejects(service.register({}, 'test'), failure => failure === error)
})
