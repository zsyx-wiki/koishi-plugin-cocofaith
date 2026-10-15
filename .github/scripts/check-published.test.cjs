const test = require('node:test')
const assert = require('node:assert/strict')
const { isPublished } = require('./check-published.cjs')
const metadata = { name: 'example', version: '3.0.0-alpha.5' }
const fail = (code) => () => { throw Object.assign(new Error(code), { stdout: JSON.stringify({ error: { code } }) }) }

test('an exact published version is skipped', () => {
  assert.equal(isPublished(metadata, (command, args) => {
    assert.equal(command, 'npm')
    assert.deepEqual(args, ['view', 'example@3.0.0-alpha.5', 'version', '--json', '--registry=https://registry.npmjs.org'])
    return JSON.stringify(metadata.version)
  }), true)
})

test('a missing package or version is eligible for publishing', () => {
  assert.equal(isPublished(metadata, fail('E404')), false)
})

for (const code of ['E401', 'E403', 'E429', 'E500', 'ENOTFOUND', 'ETIMEDOUT']) {
  test(`${code} stops the workflow instead of triggering a publish`, () => {
    assert.throws(() => isPublished(metadata, fail(code)), /Cannot check/)
  })
}

test('invalid registry responses stop the workflow', () => {
  for (const output of ['not JSON', 'null', '"3.0.0-alpha.4"', '[]']) {
    assert.throws(() => isPublished(metadata, () => output))
  }
  assert.throws(() => isPublished(metadata, () => { throw new Error('spawn failed') }), /Cannot check/)
})
