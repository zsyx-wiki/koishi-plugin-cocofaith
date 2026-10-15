const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const core = require('../../lib/core/index.js')
const business = require('../../lib/business/index.js')

test('true god commands enforce identity, ownership, input and faith lookup', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  app.plugin(business, {})
  await app.start()
  try {
    const user = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'truegod-owner', scope: 'global' }, '诞育')
    const stranger = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'truegod-stranger', scope: 'global' }, '诞育')
    const dispatch = (content, uid = user.uid) => app.faithBusiness.dispatch({ uid, scene: 'group', content })
    const expectError = async (content, code, uid = user.uid) => {
      const response = await dispatch(content, uid)
      assert.equal(response.error?.code, code, JSON.stringify(response))
    }
    await expectError('真神 设置祷词 椰风轻拂，神光降临', 'NOT_ALLOWED')
    await expectError('真神 设置职业 战士 椰骑士', 'NOT_ALLOWED')
    await expectError('真神 设置职业 战士', 'INVALID_INPUT')
    await expectError('信仰 职业查看', 'INVALID_INPUT')
    await expectError('信仰 职业查看 未知信仰', 'NOT_FOUND')
    assert.ok((await dispatch('信仰 职业查看 诞育')).result)
    await app.faithCore.faiths.registerDynamic({ name: '椰海', path: '生命', creatorUid: user.uid })
    const scope = app.faithCore.createBusinessScope('container')
    await scope.transaction.run(user.uid, tx => tx.statusIdentities.set(business.CONTAINER_IDENTITY_ID, { level: 'truegod', active: true, parameters: { truegodName: '椰海' } }))
    await scope.transaction.run(stranger.uid, tx => tx.statusIdentities.set(business.CONTAINER_IDENTITY_ID, { level: 'truegod', active: true, parameters: { truegodName: '椰海' } }))
    await expectError('真神 设置祷词 椰风轻拂，神光降临', 'NOT_ALLOWED', stranger.uid)
    for (const word of ['椰风，神临', '椰风轻，神光降临', '椰风轻拂来，神光降临', '椰风轻拂，神光降', '椰风轻拂，神光降临来', '椰风轻拂,神光降临', 'ABCD，EFGH', '椰风轻1，神光降临', '椰风轻拂，神光降临！']) {
      await expectError(`真神 设置祷词 ${word}`, 'INVALID_INPUT')
    }
    await expectError('真神 设置祷词 椰风神临', 'INVALID_INPUT')
    await expectError('真神 设置祷词 "椰风 ，神临"', 'INVALID_INPUT')
    await expectError('真神 设置祷词 椰风轻拂，神光降临，多余', 'INVALID_INPUT')
    await expectError('真神 设置职业 战士 一二三四五六', 'INVALID_INPUT')
    await expectError('真神 设置祷词 洞窥本质，行见真理', 'CONFLICT')
    assert.ok((await dispatch('真神 设置祷词 椰风轻拂，神光降临')).result)
    assert.ok((await dispatch('真神 设置祷词 椰风轻拂，神光降临')).result)
    await app.faithCore.faiths.registerDynamic({ name: '椰林', path: '生命', creatorUid: stranger.uid })
    await app.faithCore.faiths.setCustomProfession('椰林', '战士', '林骑士', stranger.uid)
    await expectError('真神 设置职业 战士 林骑士', 'CONFLICT')
    assert.ok((await dispatch('真神 设置职业 战士 椰骑士')).result)
    assert.match((await dispatch('信仰 职业查看 椰海')).result.content, /战士：椰骑士/)
    await Promise.all([
      app.faithCore.faiths.setCustomProfession('椰海', '法师', '椰法师', user.uid),
      app.faithCore.faiths.setCustomProfession('椰海', '牧师', '椰牧师', user.uid),
    ])
    assert.deepEqual(Object.keys(app.faithCore.faiths.require('椰海').custom_professions).sort(), ['战士', '法师', '牧师'].sort())
    await assert.rejects(app.faithCore.faiths.setCustomProfession('椰海', '刺客', '椰骑士', user.uid), { code: 'CONFLICT' })
    assert.equal(app.faithCore.faiths.require('椰海').custom_professions['刺客'], undefined)
    await assert.rejects(app.faithCore.faiths.setPrayerWord('椰海', '伪造，写入', stranger.uid), { code: 'PERMISSION_DENIED' })
    await assert.rejects(app.faithCore.faiths.setCustomProfession('椰海', '战士', '冒名者', stranger.uid), { code: 'PERMISSION_DENIED' })
    assert.equal(app.faithCore.faiths.require('椰海').prayer_word, '椰风轻拂，神光降临')
    await scope.lifecycle.dispose()
  } finally { await app.stop() }
})
