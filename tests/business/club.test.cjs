const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const core = require('../../lib/core/index.js')
const business = require('../../lib/business/index.js')

test('club keeps dues, status bonuses, titles, aid and dividends consistent', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  app.plugin(business, {})
  await app.start()
  try {
    const faith = app.faithCore.faiths.all()[0].name
    const member = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: '51001', scope: 'global' }, faith, 0)
    await app.faithCore.users.change(member.uid, { gold: 5000, ascension_score: 1000 }, { isFixed: true })
    app.faithCore.permissions.register('faith.creator', ({ uid }) => uid === member.uid)
    let serial = 0
    const dispatch = (uid, content, eventId = `club-${++serial}`) => app.faithBusiness.dispatch({ uid, scene: 'group', channelId: 'club', eventId, content })
    const club = app.faithBusiness.interfaces.use('test', 'club', 'default', new Set(['club']))
    const titles = app.faithBusiness.interfaces.use('test', 'title', 'default', new Set(['title']))

    const joined = await dispatch(member.uid, '俱乐部 加入')
    assert.match(joined.result.content, /2000 金币、200 登神分/)
    assert.deepEqual(await club.pool(), { gold: 2200, ascension: 220 })
    assert.equal((await club.status(member.uid)).level, 'public')
    assert.equal((await app.faithCore.bonuses.calculate({ uid: member.uid, type: 'gold', baseValue: 100 })).finalValue, 120)
    assert.equal((await app.faithCore.bonuses.calculate({ uid: member.uid, type: 'ascension_score', baseValue: 100 })).finalValue, 110)
    assert.deepEqual((await titles.listOwned(member.uid)).map((title) => title.name), ['好椰汁'])

    await dispatch(member.uid, '俱乐部 退出')
    assert.equal((await app.faithCore.bonuses.calculate({ uid: member.uid, type: 'gold', baseValue: 100 })).finalValue, 100)
    assert.ok((await dispatch(member.uid, '俱乐部 贡献 金币 1')).error)
    const sameDayRejoin = await dispatch(member.uid, '俱乐部 加入')
    assert.match(sameDayRejoin.result.content, /不会重复收取/)
    assert.equal((await club.status(member.uid)).stats.feeCount, 1)
    assert.deepEqual(await club.pool(), { gold: 2200, ascension: 220 })

    for (const [field, delta] of [['俱乐部缴费次数', 29], ['俱乐部金币贡献', 18000], ['俱乐部登神贡献', 800]]) {
      const result = await dispatch(member.uid, `信仰管理 数值 ${field} uid ${member.uid} ${delta}`)
      assert.ok(result.result, JSON.stringify(result))
    }
    assert.equal((await club.status(member.uid)).level, 'silver')
    assert.ok((await titles.listOwned(member.uid)).some((title) => title.name === '银牌椰汁'))
    assert.equal((await app.faithCore.bonuses.calculate({ uid: member.uid, type: 'gold', baseValue: 100 })).finalValue, 130)
    assert.deepEqual(await club.pool(), { gold: 2200, ascension: 220 }, '管理数值不能改动贡献池')

    const aided = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: '51002', scope: 'global' }, faith, 0)
    assert.ok((await dispatch(aided.uid, '俱乐部 贡献 金币 1')).error)
    assert.match((await dispatch(aided.uid, '俱乐部 救济')).result.content, /金币 \+300，登神分 \+40/)
    assert.deepEqual(await app.faithCore.economy.getWallet(aided.uid), { uid: aided.uid, gold: 300, ascension_score: 40 })
    assert.ok((await dispatch(aided.uid, '俱乐部 救济')).error)

    for (const [field, delta] of [['俱乐部缴费次数', 270], ['俱乐部金币贡献', 80000], ['俱乐部登神贡献', 4000]]) {
      assert.ok((await dispatch(member.uid, `信仰管理 数值 ${field} uid ${member.uid} ${delta}`)).result)
    }
    const hall = await club.status(member.uid)
    assert.equal(hall.level, 'hall')
    assert.equal(hall.active, true)
    assert.match((await dispatch(member.uid, '俱乐部 退出')).result.content, /每日会费已停止/)
    const retiredHall = await club.status(member.uid)
    assert.equal(retiredHall.active, true)
    assert.equal(retiredHall.duesEnabled, false)
    assert.equal((await app.faithCore.bonuses.calculate({ uid: member.uid, type: 'gold', baseValue: 100 })).finalValue, 150)

    const beforeDividend = await app.faithCore.economy.getWallet(member.uid)
    const dividend = await dispatch(member.uid, '信仰管理 俱乐部 分成', 'club-dividend')
    assert.match(dividend.result.content, /1 名椰汁/)
    const afterDividend = await app.faithCore.economy.getWallet(member.uid)
    assert.equal(afterDividend.gold - beforeDividend.gold, 760)
    assert.equal(afterDividend.ascension_score - beforeDividend.ascension_score, 72)
    assert.deepEqual(await club.pool(), { gold: 950, ascension: 90 })
    const hallRejoin = await dispatch(member.uid, '俱乐部 加入')
    assert.match(hallRejoin.result.content, /不再重复收取/)
    assert.equal((await club.status(member.uid)).active, true)
    assert.equal((await club.status(member.uid)).duesEnabled, true)
    assert.deepEqual(await club.pool(), { gold: 950, ascension: 90 })
    await app.faithCore.lifecycle.dispatchGameDay({ date: '2099-02-01', previousDate: '2099-01-31', triggeredAt: new Date(), source: 'manual' })
    assert.equal((await club.status(member.uid)).stats.feeCount, 301)
    assert.deepEqual(await club.pool(), { gold: 1170, ascension: 112 })
    await dispatch(member.uid, '俱乐部 退出')
    const stoppedWallet = await app.faithCore.economy.getWallet(member.uid)
    await app.faithCore.lifecycle.dispatchGameDay({ date: '2099-02-02', previousDate: '2099-02-01', triggeredAt: new Date(), source: 'manual' })
    assert.deepEqual(await app.faithCore.economy.getWallet(member.uid), stoppedWallet)
    assert.equal((await club.status(member.uid)).active, true)
    assert.equal((await club.status(member.uid)).duesEnabled, false)
    assert.deepEqual((await titles.listOwned(member.uid)).map((title) => title.name).sort(), ['好椰汁', '银牌椰汁', '金牌椰汁', '荣誉椰汁', '殿堂椰汁'].sort())
  } finally { await app.stop() }
})

test('club level thresholds preserve the declared order and permanent hall state', () => {
  const base = { feeCount: 0, goldContribution: 0, ascensionContribution: 0, joinedAt: '', lastFeeDate: '', duesEnabled: true }
  assert.equal(business.levelFor({ ...base, feeCount: 30, goldContribution: 20000, ascensionContribution: 1000 }), 'silver')
  assert.equal(business.levelFor({ ...base, feeCount: 60, goldContribution: 30000, ascensionContribution: 2000 }), 'gold')
  assert.equal(business.levelFor({ ...base, feeCount: 90 }), 'honor')
  assert.equal(business.levelFor({ ...base, hallUnlocked: true }), 'hall')
})

test('club collects daily dues once per game day', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  app.plugin(business, {})
  await app.start()
  try {
    const faith = app.faithCore.faiths.all()[0].name
    const user = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: '51003', scope: 'global' }, faith, 0)
    await app.faithCore.users.change(user.uid, { gold: 3000, ascension_score: 300 }, { isFixed: true })
    await app.faithBusiness.dispatch({ uid: user.uid, scene: 'group', channelId: 'club', eventId: 'daily-join', content: '俱乐部 加入' })
    await app.faithCore.lifecycle.dispatchGameDay({ date: '2099-01-01', previousDate: '2098-12-31', triggeredAt: new Date(), source: 'manual' })
    await app.faithCore.lifecycle.dispatchGameDay({ date: '2099-01-01', previousDate: '2098-12-31', triggeredAt: new Date(), source: 'manual' })
    const club = app.faithBusiness.interfaces.use('test', 'club', 'default', new Set(['club']))
    assert.equal((await club.status(user.uid)).stats.feeCount, 2)
    assert.deepEqual(await app.faithCore.economy.getWallet(user.uid), { uid: user.uid, gold: 800, ascension_score: 80 })
    assert.deepEqual(await club.pool(), { gold: 2420, ascension: 242 })
  } finally { await app.stop() }
})
