const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const core = require('../../lib/core/index.js')
const business = require('../../lib/business/index.js')

test('container EX items and v2 infusion tiers are explicit', () => {
  assert.ok(core.CORE_ITEM_LEVELS.find((item) => item.id === 'EX').rank > core.CORE_ITEM_LEVELS.find((item) => item.id === 'SP').rank)
  assert.deepEqual(business.CONTAINER_ITEMS.map((item) => [item.name, item.level, item.marketable, item.price]), [
    ['神性容器', 'EX', false, 0],
    ['神性碎片', 'EX', false, 0],
  ])
  assert.equal(business.calculateDivinityGain('fragment', 2, 50), 30)
  assert.equal(business.calculateDivinityGain('fragment', 2, 101), 20)
  assert.equal(business.calculateDivinityGain('roulette', 2, 10), 1.5)
})

test('true god cost only counts container-created faiths on the selected path', () => {
  const faiths = [
    { type: 'fixed', metadata: {} },
    { type: 'dynamic', metadata: { source: 'external' } },
    { type: 'dynamic', metadata: { source: 'divinity_container' } },
    { type: 'dynamic', metadata: { source: 'divinity_container' } },
  ]
  const service = new business.ContainerService({ faiths: { byPath: () => faiths } }, {}, {}, business.CONTAINER_CONFIG.defaults)
  assert.deepEqual(service.trueGodCost('生命'), { gold: 130000, ascension_score: 8000 })
})

test('container grants, infuses, ascends and reuses dynamic faith customization', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  app.plugin(business, {})
  await app.start()
  try {
    const user = await app.faithCore.faiths.registerUser(
      { adapter: 'onebot', type: 'qq_account', value: '53001', scope: 'global' },
      '诞育',
      0,
    )
    const container = app.faithBusiness.interfaces.use('test', 'container', 'default', new Set(['container']))
    const roulette = app.faithBusiness.interfaces.use('test', 'roulette', 'default', new Set(['roulette']))
    const titles = app.faithBusiness.interfaces.use('test', 'title', 'default', new Set(['title']))
    let serial = 0
    const dispatch = (content, eventId = `container-${++serial}`) => app.faithBusiness.dispatch({ uid: user.uid, scene: 'group', channelId: 'container', eventId, displayName: '测试者', content })

    assert.deepEqual(await container.grant(user.uid, 'test'), { kind: 'container' })
    assert.deepEqual(await container.grant(user.uid, 'test-again'), { kind: 'fragment' })
    assert.equal(await app.faithCore.items.getQuantity(user.uid, business.FAITH_CONTAINER_ITEM_ID), 1)
    assert.equal(await app.faithCore.items.getQuantity(user.uid, business.DIVINITY_FRAGMENT_ITEM_ID), 1)
    assert.equal((await app.faithCore.items.require(business.FAITH_CONTAINER_ITEM_ID)).marketable, false)
    assert.ok((await dispatch('信仰 卖出 神性容器')).error)
    assert.match((await dispatch('感孕生命，衍育自然')).result.content, /生命之神/)

    assert.match((await dispatch('容器 查看')).result.content, /神性：0\.00 \/ 300/)
    assert.match((await dispatch('容器 投入 神性碎片 1')).result.content, /神性 \+15\.00/)
    await roulette.changeHonor(user.uid, 10)
    assert.match((await dispatch('容器 投入 轮盘赌荣誉 2')).result.content, /神性 \+1\.50/)
    assert.equal((await roulette.stats(user.uid)).honor, 8)

    app.faithCore.permissions.register('faith.creator', ({ uid }) => uid === user.uid)
    assert.ok((await dispatch(`信仰管理 数值 神性 uid ${user.uid} 133.5`)).result)
    const beforeAscension = await container.status(user.uid)
    assert.equal(beforeAscension.state.divinity, 150)
    assert.equal((await app.faithCore.bonuses.calculate({ uid: user.uid, type: 'gold', baseValue: 100 })).finalValue, 130)

    const subgod = await dispatch('容器 从神 小椰')
    assert.match(subgod.result.content, /从神神格/)
    assert.equal((await container.status(user.uid)).level, 'subgod')
    assert.ok((await titles.listOwned(user.uid)).some((title) => title.name === '小椰'))
    assert.equal((await app.faithCore.bonuses.calculate({ uid: user.uid, type: 'gold', baseValue: 100 })).finalValue, 125)
    assert.equal((await app.faithCore.bonuses.calculate({ uid: user.uid, type: 'void_prayer.daily_limit', baseValue: 10 })).finalValue, 20)
    assert.equal((await app.faithCore.bonuses.calculate({ uid: user.uid, type: 'daily_prayer.daily_limit', baseValue: 3 })).finalValue, 4)
    const dailyPrayer = app.faithBusiness.interfaces.use('test', 'daily_prayer', 'default', new Set(['daily_prayer']))
    assert.equal((await dailyPrayer.status(user.uid)).limit, 2)

    await app.faithCore.users.change(user.uid, { ascension_score: 1200 }, { isFixed: true })
    assert.ok((await dispatch('信仰 弃誓 繁荣')).result)
    assert.equal((await container.status(user.uid)).level, 'subgod')

    const sp = app.faithCore.items.list({ level: 'SP', marketable: true }).find((item) => item.type === '道具')
    assert.ok(sp, '基础物品池应包含可出售的常规 SP 道具')
    await app.faithCore.items.give(user.uid, sp.item_id)
    await app.faithCore.users.change(user.uid, { gold: 100000, ascension_score: 5000 }, { isFixed: true })
    assert.ok((await dispatch(`信仰管理 数值 神性 uid ${user.uid} 250`)).result)
    const truegod = await dispatch(`容器 真神 椰神 生命 "${sp.name}"`)
    assert.match(truegod.result.content, /信仰【椰神】已经建立/)
    assert.equal((await container.status(user.uid)).level, 'truegod')
    assert.equal((await app.faithCore.users.require(user.uid)).faiths[0], '椰神')
    assert.equal(app.faithCore.faiths.require('椰神').believer_count, 1)
    assert.equal((await app.faithCore.bonuses.calculate({ uid: user.uid, type: 'gold', baseValue: 100 })).finalValue, 175)
    assert.equal((await app.faithCore.bonuses.calculate({ uid: user.uid, type: 'void_prayer.daily_limit', baseValue: 10 })).finalValue, 70)

    await assert.rejects(() => app.faithCore.faiths.setPrayerWord('椰神', '洞窥本质，行见真理'), /祷词已由信仰 真理 使用/)
    assert.ok((await dispatch('真神 设置祷词 椰风轻拂，神光降临')).result)
    assert.ok((await dispatch('真神 设置职业 战士 椰骑士')).result)
    const faith = app.faithCore.faiths.require('椰神')
    assert.equal(faith.prayer_word, '椰风轻拂，神光降临')
    assert.equal(faith.custom_professions['战士'], '椰骑士')
    assert.equal(app.faithCore.professions.getByName('椰骑士').faith, '椰神')

    const follower = await app.faithCore.faiths.registerUser(
      { adapter: 'onebot', type: 'qq_account', value: '53002', scope: 'global' },
      '椰神',
      0,
    )
    const prayer = await app.faithBusiness.dispatch({ uid: follower.uid, scene: 'group', content: '椰风轻拂，神光降临' })
    assert.ok((await app.faithBusiness.dispatch({ uid: follower.uid, scene: 'group', content: '信仰 职业查看 椰神' })).result.content.includes('椰骑士'))
    assert.ok((await app.faithBusiness.dispatch({ uid: follower.uid, scene: 'group', content: '信仰 职业 椰骑士' })).result)
    assert.equal((await app.faithCore.users.require(follower.uid)).profession_id, '椰骑士')
    assert.equal(prayer.matched, true)
    assert.match(prayer.result.content, /椰神/)

    await app.faithCore.users.change(user.uid, { ascension_score: 2200 }, { isFixed: true })
    assert.ok((await dispatch('信仰 弃誓 死亡')).result)
    assert.equal((await container.status(user.uid)).level, 'truegod')
    assert.ok((await dispatch('真神 设置祷词 椰风轻拂，神明归来')).result)
    assert.equal(app.faithCore.faiths.require('椰神').prayer_word, '椰风轻拂，神明归来')
    assert.ok((await dispatch('真神 设置职业 战士 椰神骑士')).result)
    assert.equal((await app.faithCore.users.require(follower.uid)).profession_id, '椰神骑士')
    assert.equal(app.faithCore.professions.getByName('椰骑士'), undefined)
    assert.equal(app.faithCore.professions.getByName('椰神骑士').faith, '椰神')
    await app.faithCore.faiths.load()
    assert.equal(app.faithCore.professions.getByName('椰神骑士').faith, '椰神')
    await titles.unregister('小椰', { force: true })
    await titles.unregister('椰神', { force: true })
    await app.faithBusiness.disable('container')
    await app.faithBusiness.enable('container')
    assert.deepEqual((await titles.listOwned(user.uid)).map((title) => title.name).sort(), ['小椰', '椰神'])
    await app.faithCore.lifecycle.dispatchGameDay({ date: '2099-03-01', previousDate: '2099-02-28', triggeredAt: new Date(), source: 'manual' })
    const renewed = await container.status(user.uid)
    assert.ok(renewed.state.divinity >= 0.5 && renewed.state.divinity <= 1.5)
    assert.equal(renewed.state.consecrationCharges, 3)
  } finally { await app.stop() }
})
