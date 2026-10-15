const test = require('node:test')
const assert = require('node:assert/strict')
const business = require('../../lib/business/index.js')
const { Schema } = require('koishi')

test('empty Koishi config satisfies the plugin schema', () => {
  const config = new Schema(business.Config)({})
  assert.equal(config.voidPrayer.config.probabilities.SP, 0.0005)
})

test('Business result protocol accepts only declared delivery policies', () => {
  assert.doesNotThrow(() => business.assertBusinessResult({ type: 'text', content: 'x', delivery: 'proactive-required' }))
  assert.doesNotThrow(() => business.assertBusinessResult({ type: 'silent' }))
  assert.throws(() => business.assertBusinessResult({ type: 'text', content: 'x', delivery: 'always' }))
  assert.doesNotThrow(() => business.assertBusinessResult({ type: 'text', content: 'x', broadcast: { id: 'room:max', content: '满级' } }))
  for (const broadcast of [null, {}, { id: '', content: 'x' }, { id: 'x', content: 1 }]) {
    assert.throws(() => business.assertBusinessResult({ type: 'text', content: 'x', broadcast }))
  }
})

test('faith information uses one colon-delimited field per line', () => {
  const text = business.formatFaithInfo({ uid: 10000000, faiths: ['真理'], abandon_count: 2, profession_id: '', ascension_score: 10, audience_score: 20, audience_rank: 0, gold: 30 })
  assert.equal(text.includes('｜'), false)
  assert.match(text, /信仰：真理\n弃誓次数：2/)
})

test('faith admin routes extensions by a unique business command', () => {
  const registry = new business.FaithAdminCommandRegistry()
  registry.register({ business: 'title', command: '称号', execute: async () => ({ type: 'silent' }) })
  assert.equal(registry.get('称号').business, 'title')
  assert.throws(() => registry.register({ business: 'other', command: '称号', execute: async () => ({ type: 'silent' }) }))
})

test('void prayer defaults preserve v2 probability distribution', () => {
  const config = business.validateVoidPrayerConfig(business.DEFAULT_VOID_PRAYER_CONFIG)
  assert.equal(Object.values(config.probabilities).reduce((sum, value) => sum + value, 0), 1)
  assert.equal(business.selectLevel(0, config.probabilities), 'SP')
  assert.equal(business.selectLevel(0.0005, config.probabilities), 'SSS')
  assert.equal(business.selectLevel(0.999999, config.probabilities), 'D')
})

test('void prayer cost preserves the v2 three-base-price rule', () => {
  const config = business.DEFAULT_VOID_PRAYER_CONFIG
  assert.equal(business.calculateCost(0, 3, config, 0), 135)
  assert.equal(business.calculateCost(2, 3, config, 0), 205)
  assert.equal(business.calculateCost(3, 2, config, 0.2), 128)
})

test('void prayer rejects invalid probability totals', () => {
  assert.throws(() => business.validateVoidPrayerConfig({ ...business.DEFAULT_VOID_PRAYER_CONFIG, probabilities: { ...business.DEFAULT_VOID_PRAYER_CONFIG.probabilities, D: 0.4 } }))
})

test('void prayer commits cost, daily state, items and one non-duplicate egg together', async () => {
  const sp = { item_id: 'sp', name: 'UP', type: '道具', level: 'SP', obtainable: true, max_quantity: 0 }
  const egg = { item_id: 'egg', name: 'Egg', type: '彩蛋', level: '彩蛋', obtainable: true, max_quantity: 1 }
  let gold = 1_000
  let privateData = {}
  const inventory = new Map()
  const scope = {
    data: {
      get: async () => ({ private: privateData, public: {} }),
      set: async ({ private: value }) => { privateData = value; return { private: privateData, public: {} } },
    },
    economy: {
      canAfford: async ({ gold: cost }) => gold >= cost,
      getWallet: async () => ({ uid: 10000000, gold, ascension_score: 0 }),
      pay: async ({ gold: cost }) => { gold -= cost },
    },
    items: {
      getQuantity: async (id) => inventory.get(id) || 0,
      give: async (id, quantity) => inventory.set(id, (inventory.get(id) || 0) + quantity),
    },
  }
  const coreScope = {
    items: { obtainable: () => [sp, egg] },
    bonuses: { calculate: async ({ uid, type, baseValue, source }) => ({ uid, type, baseValue, source, multiplier: 1, fixedBonus: 0, finalValue: baseValue, contributions: [], failures: [] }) },
    gameDay: { currentDate: () => '2026-09-02' },
    transaction: { run: async (_uid, task) => task(scope) },
  }
  const config = business.validateVoidPrayerConfig({ ...business.DEFAULT_VOID_PRAYER_CONFIG, probabilities: { SP: 1, SSS: 0, SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0 }, upSpItems: ['UP'], easterEggChance: 1 })
  const service = new business.VoidPrayerService(coreScope, config, () => 0)
  const result = await service.pray(10000000, 2)
  assert.equal(gold, 910)
  assert.equal(inventory.get('sp'), 2)
  assert.equal(inventory.get('egg'), 1)
  assert.equal(privateData.dailyUsed, 2)
  assert.deepEqual(result.counts, { '彩蛋': 1, SP: 2 })
})

test('daily prayer preserves v2 limits, reward ranges and applies the credited result atomically', async () => {
  let user = { uid: 10000000, faiths: ['真理'], gold: 100, ascension_score: 10 }
  let privateData = {}
  const scope = {
    users: {
      get: async () => user,
      change: async (delta) => { user = { ...user, gold: user.gold + (delta.gold || 0), ascension_score: user.ascension_score + (delta.ascension_score || 0) }; return user },
    },
    data: {
      get: async () => ({ private: privateData, public: {} }),
      set: async ({ private: value }) => { privateData = value; return { private: value, public: {} } },
    },
  }
  const core = {
    users: { require: async () => user }, gameDay: { currentDate: () => '2026-09-02' },
    bonuses: { calculate: async (request) => ({ ...request, finalValue: request.baseValue, multiplier: 1, fixedBonus: 0, contributions: [], failures: [] }) },
    economy: { previewReward: async (_uid, value) => ({ applied: { gold: value.gold * 2, ascension_score: value.ascension_score * 2 } }) },
    transaction: { run: async (_uid, task) => task(scope) },
    data: { get: async () => ({ private: privateData, public: {} }) },
  }
  const service = new business.DailyPrayerService(core, business.DEFAULT_DAILY_PRAYER_CONFIG, () => 0.5)
  const result = await service.pray(10000000, '真理', '真理之神')
  assert.equal(result.count, 1)
  assert.equal(privateData.count, 1)
  assert.equal(user.gold, 476)
  assert.equal(user.ascension_score, 76)
  await assert.rejects(() => service.pray(10000000, '真理', '真理之神'), /已达上限/)

  privateData = {}
  user = { ...user, gold: 100, ascension_score: 10 }
  let previewCalls = 0
  core.economy.previewReward = async () => { previewCalls++; throw new Error('zero positive rewards must not be previewed') }
  const negative = new business.DailyPrayerService(core, {
    ...business.DEFAULT_DAILY_PRAYER_CONFIG,
    ascensionMin: -1, ascensionMax: -1, goldMin: -1, goldMax: -1,
  }, () => 0.5)
  const negativeResult = await negative.pray(10000000, '真理', '真理之神')
  assert.equal(previewCalls, 0)
  assert.deepEqual(negativeResult.reward, { gold: -1, ascension_score: -1 })
  assert.equal(user.gold, 99)
  assert.equal(user.ascension_score, 9)
})

test('dynamic message commands participate in fast filtering and routing', () => {
  const router = new business.BusinessCommandRouter()
  router.register('daily_prayer', [{ id: 'pray', commands: [], match: (content) => content === '洞窥本质，行见真理', execute: async () => ({ type: 'silent' }) }])
  assert.equal(router.acceptsCommand('洞窥本质，行见真理'), true)
  assert.equal(router.acceptsCommand('普通聊天'), false)
  const match = router.resolve({ uid: 10000000, scene: 'group', content: '洞窥本质，行见真理' })
  assert.equal(match.business, 'daily_prayer')
  assert.equal(router.list()[0].command.id, 'pray')
})

test('faith sale atomically removes items and credits their fixed v3 price', async () => {
  const bread = { item_id: 'bread', name: '手指面包', type: '道具', level: 'C', marketable: true, price: 35 }
  let quantity = 5, gold = 10
  const tx = {
    items: {
      getQuantity: async () => quantity,
      take: async (_id, count) => { quantity -= count },
      getStacks: async () => [{ item_id: 'bread', quantity }],
    },
    economy: { creditFixed: async ({ gold: value }) => { gold += value } },
  }
  const core = {
    items: {
      resolve: () => bread, get: () => bread,
      levels: { get: (level) => level === 'C' ? { id: 'C' } : undefined },
    },
    transaction: { run: async (_uid, task) => task(tx) },
  }
  const service = new business.FaithSaleService(core)
  const sold = await service.sell(10000000, '手指面包', 2)
  assert.deepEqual({ quantity: sold.quantity, gain: sold.gold, remaining: quantity, wallet: gold }, { quantity: 2, gain: 70, remaining: 3, wallet: 80 })
  const byLevel = await service.sellLevel(10000000, 'c', false)
  assert.deepEqual({ quantity: byLevel.quantity, remaining: quantity, wallet: gold }, { quantity: 2, remaining: 1, wallet: 150 })
})

test('faith level sale command aliases resolve to their exact handlers', () => {
  const router = new business.BusinessCommandRouter()
  assert.equal(router.acceptsCommand('信仰 信息'), false)
  router.register('faith', business.faithModule.commands)
  for (const content of ['信仰 信息', '/信仰 信息', '  / 信仰 信息', '"信仰" 信息']) {
    assert.equal(router.acceptsCommand(content), true)
  }
  assert.equal(router.acceptsCommand('信仰者 信息'), false)
  assert.equal(router.acceptsCommand(''), false)
  router.unregister('faith')
  assert.equal(router.acceptsCommand('信仰 信息'), false)
  router.register('faith', business.faithModule.commands)
  assert.equal(router.resolve({ uid: 10000000, scene: 'group', content: '信仰 卖出等级 C' }).commandId, 'faith.sell_level')
  assert.equal(router.resolve({ uid: 10000000, scene: 'group', content: '信仰 强制卖出等级 C' }).commandId, 'faith.force_sell_level')
  assert.equal(router.resolve({ uid: 10000000, scene: 'group', content: '信仰 打开 破烂的钱包' }).commandId, 'faith.open')
})

test('title registry excludes the private v2 creator title and validates bonuses', () => {
  const registry = new business.TitleRegistry()
  registry.registerMany(business.BUILTIN_TITLES)
  assert.equal(registry.getByName('墨墨'), undefined)
  assert.equal(registry.getByName('虚空收藏家').bonuses.length, 2)
  assert.throws(() => registry.register({ id: 'bad', name: '坏称号', description: 'x', source: 'x', bonuses: [{ type: 'INVALID TYPE', modifier: 1 }] }))
})

test('title service stores owned and active titles in one UID-indexed row', async () => {
  let row
  const table = {
    get: async ({ uid } = {}) => row && (uid === undefined || uid === row.uid) ? [structuredClone(row)] : [],
    create: async (value) => { row = structuredClone(value); return row },
    set: async (query, value) => {
      assert.equal(Object.hasOwn(value, 'uid'), false)
      if (!row || query.uid !== row.uid || +new Date(query.updated_at) !== +new Date(row.updated_at)) return { matched: 0 }
      row = { ...row, ...structuredClone(value) }; return { matched: 1 }
    },
  }
  const service = new business.TitleService({ table, users: { require: async () => ({ uid: 10000000 }) } })
  service.registerMany(business.BUILTIN_TITLES)
  assert.equal(await service.grant(10000000, '虚空收藏家'), true)
  assert.equal(await service.grant(10000000, '虚空收藏家'), false)
  assert.equal((await service.use(10000000, '虚空收藏家')).name, '虚空收藏家')
  assert.equal((await service.getActive(10000000)).name, '虚空收藏家')
  assert.deepEqual(row.titles, ['void-collector'])
})
