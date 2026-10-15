const test = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const core = require('../../lib/core/index.js')
const business = require('../../lib/business/index.js')

test('faith abandonment atomically pays both costs and changes faith without false conflicts', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  app.plugin(business, { faith: { config: { abandonBaseAscensionCost: 1200, abandonAscensionCostPerUse: 1000, abandonMaxAscensionCost: 10000 } } })
  await app.start()
  try {
    const [oldFaith, newFaith] = app.faithCore.faiths.all().slice(0, 2).map((faith) => faith.name)
    const user = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: '40001', scope: 'global' }, oldFaith, 0)
    await app.faithCore.users.change(user.uid, { ascension_score: 5000, audience_score: 100 })
    const event = { uid: user.uid, scene: 'group', channelId: 'faith', eventId: 'abandon-once', content: `信仰 弃誓 ${newFaith}` }
    const result = await app.faithBusiness.dispatch(event)
    assert.ok(result.result, JSON.stringify(result))
    const after = await app.faithCore.users.require(user.uid)
    assert.equal(after.faiths[0], newFaith)
    assert.equal(after.abandon_count, 1)
    assert.equal(after.ascension_score, 3800)
    assert.equal(after.audience_score, 100)
  } finally { await app.stop() }
})

test('Business may first load after Core ready; table registration remains limited to module initialization', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  await app.start()
  try {
    assert.equal(app.faithCore.lifecycle.state, 'ready')
    let saved
    const facade = new business.FaithBusinessService(app, {})
    business.registerBuiltInBusinessModules(facade)
    facade.register({ name: 'late_probe', init(ctx) { saved = ctx.core }, reload(ctx) {
      ctx.core.registerTable({ id: 'unsigned' }, { primary: 'id' })
    } })
    await facade.start()
    assert.equal(facade.status('title').state, 'ready')
    assert.equal(facade.status('rooms').state, 'ready')
    assert.throws(() => saved.registerTable({ id: 'unsigned' }, { primary: 'id' }), /自身 init\/ready/)
    await assert.rejects(() => facade.reload('late_probe'))
    await facade.disable('faith_admin', { cascade: true })
    await facade.enable('roulette')
    assert.equal(facade.status('title').state, 'ready')
    const changed = app.faithCore.createBusinessScope('title', { canRegisterTable: () => true })
    assert.throws(() => changed.registerTable({ id: 'unsigned' }, { primary: 'id' }), /不能在运行中改变表结构/)
    await changed.lifecycle.dispose()
    await facade.disable('late_probe')
    assert.throws(() => saved.registerTable({ id: 'unsigned' }, { primary: 'id' }), /已卸载/)
  } finally { await app.stop() }
})

test('reloading the Business plugin releases its old lifecycle and restores admin registration', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  const fork = app.plugin(business, {})
  await app.start()
  try {
    const old = app.faithBusiness
    fork.dispose()
    await app.lifecycle.flush()
    for (let i = 0; i < 50 && old.list().length; i++) await new Promise(setImmediate)
    assert.equal(old.lifecycle.disposed, true)
    assert.equal(old.list().length, 0)
    app.plugin(business, {})
    await app.lifecycle.flush()
    const next = app.faithBusiness
    assert.notEqual(next, old)
    await next.start()
    const commands = next.interfaces.use('test', 'faith_admin', 'commands', new Set(['faith_admin']))
    assert.deepEqual(commands.list().map((command) => command.command).sort(), ['数值', '称号', '图鉴', '俱乐部', '容器'].sort())
    const user = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: '30002', scope: 'global' }, app.faithCore.faiths.all()[0].name, 0)
    app.faithCore.permissions.register('faith.creator', () => true)
    const reply = await next.dispatch({ uid: user.uid, scene: 'group', eventId: 'after-reload', content: '信仰管理 数值 全体 金币 1000' })
    assert.ok(reply.result, JSON.stringify(reply))
    assert.equal((await app.faithCore.users.require(user.uid)).gold, 1000)
  } finally { await app.stop() }
})

test('unloading one Business instance must not clear another instance admin commands', async () => {
  const apps = [new App(), new App()]
  try {
    for (const app of apps) {
      app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
      app.plugin(core, { gameDay: { enabled: false } })
      app.plugin(business, {})
      await app.start()
    }
    await apps[0].stop()
    const app = apps[1]
    const user = await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: '30001', scope: 'global' }, app.faithCore.faiths.all()[0].name, 0)
    app.faithCore.permissions.register('faith.creator', () => true)
    const reply = await app.faithBusiness.dispatch({ uid: user.uid, scene: 'group', channelId: 'test', roomKey: 'onebot:test', eventId: 'isolated-admin', content: '信仰管理 数值 全体 金币 1000' })
    assert.ok(reply.result, JSON.stringify(reply))
    assert.match(reply.result.content, /成功：1 人/)
    assert.equal((await app.faithCore.users.require(user.uid)).gold, 1000)
    await app.faithBusiness.disable('faith_admin', { cascade: true })
    await app.faithBusiness.enable('title')
    const next = await app.faithBusiness.dispatch({ uid: user.uid, scene: 'group', content: '信仰管理 数值 全体 金币 1000', eventId: 're-enabled-admin' })
    assert.ok(next.result, JSON.stringify(next))
    assert.equal((await app.faithCore.users.require(user.uid)).gold, 2000)
    const commands = app.faithBusiness.interfaces.use('test', 'faith_admin', 'commands', new Set(['faith_admin']))
    assert.deepEqual(commands.list().map((command) => command.command).sort(), ['数值', '称号'].sort())
  } finally { for (const app of apps) await app.stop() }
})

test('all-user numeric command requires creator, validates input and deduplicates the same message', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  app.plugin(business, {})
  await app.start()
  try {
    const faith = app.faithCore.faiths.all()[0].name
    const users = []
    for (const qq of ['20001', '20002']) users.push(await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: qq, scope: 'global' }, faith, 0))
    const permission = app.faithCore.permissions.register('faith.creator', ({ uid }) => uid === users[0].uid)
    const event = { uid: users[0].uid, scene: 'group', roomKey: 'onebot:admin', channelId: 'admin', eventId: 'bulk-message', content: '信仰管理 数值 全体 金币 1000' }
    const denied = await app.faithBusiness.dispatch({ ...event, uid: users[1].uid })
    assert.equal(denied.result.type, 'silent')
    const first = await app.faithBusiness.dispatch(event)
    assert.ok(first.result, JSON.stringify(first))
    assert.match(first.result.content, /成功：2 人/)
    const repeated = await app.faithBusiness.dispatch(event)
    assert.match(repeated.result.content, /已处理跳过：2 人/)
    for (const user of users) assert.equal((await app.faithCore.users.require(user.uid)).gold, 1000)
    const negative = await app.faithBusiness.dispatch({ ...event, eventId: 'bulk-negative', content: '信仰管理 数值 全体 金币 -1200' })
    assert.match(negative.result.content, /成功：2 人/)
    for (const user of users) assert.equal((await app.faithCore.users.require(user.uid)).gold, -200)
    const custom = await app.faithBusiness.dispatch({ ...event, eventId: 'bulk-custom', content: '信仰管理 数值 全体 奖励祈求 3' })
    assert.match(custom.result.content, /成功：2 人/)
    const voidApi = app.faithBusiness.interfaces.use('test', 'void_prayer', 'default', new Set(['void_prayer']))
    for (const user of users) assert.equal((await voidApi.status(user.uid)).consumableExtra, 3)
    const customRepeated = await app.faithBusiness.dispatch({ ...event, eventId: 'bulk-custom', content: '信仰管理 数值 全体 奖励祈求 3' })
    assert.match(customRepeated.result.content, /已处理跳过：2 人/)
    for (const content of ['信仰管理 数值 全体 金币 0.5', '信仰管理 数值 全体 金币 Infinity', '信仰管理 数值 全体 未知 1', '信仰管理 数值 全体 金币 1 多余']) {
      assert.ok((await app.faithBusiness.dispatch({ ...event, eventId: content, content })).error)
    }
    const single = await app.faithBusiness.dispatch({ ...event, eventId: 'single', content: `信仰管理 数值 金币 uid ${users[1].uid} -5` })
    assert.ok(single.result)
    assert.equal((await app.faithCore.users.require(users[1].uid)).gold, -205)
    permission.dispose()
  } finally { await app.stop() }
})

test('SQLite room integration: unique group, atomic tickets, duplicate actions, settlement and refund', async () => {
  const app = new App()
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' })
  app.plugin(core, { gameDay: { enabled: false } })
  app.plugin(business, { roulette: { config: { normalMin: 2, gamblerMin: 2, crazyMin: 2 } } })
  await app.start()
  try {
    assert.equal(app.faithBusiness.status('roulette').state, 'ready')
    const faith = app.faithCore.faiths.all()[0].name
    const users = []
    for (let i = 0; i < 3; i++) users.push(await app.faithCore.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: String(10000 + i), scope: 'global' }, faith, i === 1 ? 0 : 1000))
    let serial = 0
    const event = (i, content, id) => ({ uid: users[i].uid, scene: 'group', channelId: 'test', roomKey: 'onebot:test', eventId: id ?? String(++serial), content, displayName: String(i) })
    const dispatch = (i, content, id) => app.faithBusiness.dispatch(event(i, content, id))
    const result = await Promise.all([dispatch(0, '恶魔轮盘 发起疯狂'), dispatch(2, '恶魔轮盘 发起')])
    assert.equal(result.filter((r) => r.result).length, 1)
    const [first] = await app.database.get('faith_business_rooms', { active: true })
    const creator = users.findIndex((u) => u.uid === first.room.creator)
    // 两个并发创建谁先进入无关紧要；下面重新建立明确的收费房间。
    await dispatch(creator, '恶魔轮盘 结束')
    await dispatch(0, '恶魔轮盘 发起疯狂')
    const joined = await dispatch(1, '恶魔轮盘 加入', 'join-player')
    assert.match(joined.result.content, /加入成功：1\n人数：2\/16（至少2人）\n房主：0/)
    assert.equal((await dispatch(1, '恶魔轮盘 加入', 'join-player')).result.content, joined.result.content)
    const failed = await dispatch(0, '恶魔轮盘 开始')
    assert.ok(failed.error)
    assert.equal((await app.faithCore.users.require(users[0].uid)).gold, 1000)
    const [waiting] = await app.database.get('faith_business_rooms', { active: true })
    assert.equal(waiting.room.status, 'waiting')
    assert.deepEqual(waiting.room.members.map((m) => m.ticket), [{}, {}])
    await app.faithCore.economy.refund(users[1].uid, { gold: 1000 }, { source: 'test.refund' })
    assert.ok((await dispatch(0, '恶魔轮盘 开始')).result)
    assert.equal((await app.faithCore.users.require(users[0].uid)).gold, 900)
    let [row] = await app.database.get('faith_business_rooms', { active: true })
    const turnUid = row.room.state.current
    const turnPlayer = users.findIndex((u) => u.uid === turnUid)
    const duplicate = event(turnPlayer, '恶魔轮盘 开枪', 'duplicate')
    await Promise.all([app.faithBusiness.dispatch(duplicate), app.faithBusiness.dispatch(duplicate)])
    ;[row] = await app.database.get('faith_business_rooms', { key: row.key })
    assert.equal(row.room.state.turn, 1)
    const permission = app.faithCore.permissions.register('faith.creator', () => true)
    if (row.active) {
      assert.ok((await dispatch(2, '恶魔轮盘 强制结束')).result)
      assert.equal((await app.faithCore.users.require(users[0].uid)).gold, 1000)
      assert.equal((await app.faithCore.users.require(users[1].uid)).gold, 1000)
    }
    permission.dispose()
    assert.equal((await app.database.get('faith_business_rooms', { active: true })).length, 0)
    // 旧事件不能在下一局重新执行开枪。
    await dispatch(0, '恶魔轮盘 发起')
    await dispatch(1, '恶魔轮盘 加入')
    await dispatch(0, '恶魔轮盘 开始')
    const replay = await app.faithBusiness.dispatch(duplicate)
    assert.ok(replay.error || replay.result)
    ;[row] = await app.database.get('faith_business_rooms', { active: true })
    assert.equal(row.room.state.turn, 0)
    const rooms = app.faithBusiness.interfaces.use('test', 'rooms', 'default', new Set(['rooms']))
    const registration = rooms.register({
      id: 'probe',
      async start(room) { room.deadline = Date.now() + 10 },
      async action() { throw new Error('not your turn') },
      async timeout(room) { room.state.count++; room.deadline = Date.now() + 10; if (room.state.count === 3) room.status = 'ended' },
      async finish(room) { room.state.settled = true },
      render(room) { return { type: 'text', content: String(room.state.count) } },
      announcement(room) { return { id: room.id, content: '满级公告' } },
    })
    const timed = (i) => ({ ...event(i, ''), roomKey: 'onebot:timed', reply: async () => { throw new Error('QQ reply unavailable') } })
    await rooms.create(timed(0), 'probe', { min: 2, max: 2, state: { count: 0 } })
    await rooms.command(timed(1), 'probe', 'join')
    await rooms.command(timed(0), 'probe', 'start')
    let refreshed = 0
    const notices = []
    await assert.rejects(() => rooms.command({ ...timed(1), reply: async (result) => { refreshed++; if (result.broadcast) notices.push(result.broadcast); throw new Error('send failed') } }, 'probe', 'wrong'))
    let completed
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      completed = (await app.database.get('faith_business_rooms')).find((r) => r.room.owner === 'probe')
      if (completed?.room.status === 'ended') break
    }
    assert.equal(completed.room.state.count, 3)
    assert.equal(completed.room.state.settled, true)
    assert.equal(completed.active, false)
    assert.ok(refreshed > 0)
    assert.equal(notices.length, 1)
    assert.equal((await rooms.command(timed(1), 'probe', 'view')).broadcast, undefined)
    await registration.dispose()
    await app.faithBusiness.disable('rooms', { cascade: true })
    assert.equal(app.faithBusiness.status('rooms').state, 'disabled')
    await app.faithBusiness.enable('roulette')
    assert.equal(app.faithBusiness.status('rooms').state, 'ready')
    assert.equal(app.faithBusiness.status('roulette').state, 'ready')
    const resumed = await dispatch(0, '恶魔轮盘 对局')
    assert.ok(resumed.result)
  } finally { await app.stop() }
})

test('round engine terminates with repeated timeouts and preserves every participant', () => {
  const service = new business.RouletteService({}, {}, business.DEFAULT_ROULETTE_CONFIG)
  const engine = new business.RouletteEngine(service.rules, () => .99)
  const state = business.initialState('normal')
  state.players = [1, 2, 3, 4].map((uid) => ({ uid, name: String(uid), path: '无', level: 1, alive: true, timeouts: 0, flags: {}, chambers: [], penalty: {} }))
  engine.start(state)
  assert.equal(state.current, 1)
  assert.deepEqual(state.order, [1, 2, 3, 4])
  for (let n = 0; n < 10 && state.players.filter((p) => p.alive).length > 1; n++) engine.act(state, state.current, '开枪', true)
  assert.ok(state.players.filter((p) => p.alive).length <= 1)
  assert.equal(state.players.length, 4)
  assert.equal(new Set(state.deaths).size, state.deaths.length)
})

test('roulette assigns seat numbers after shuffling so seat one is always first', async () => {
  const service = new business.RouletteService({ faiths: { get: () => ({ path: '生命' }) } }, {}, business.DEFAULT_ROULETTE_CONFIG)
  const room = { members: [1, 2, 3, 4].map((uid) => ({ uid, name: `加入${uid}`, ticket: {} })), state: business.initialState('normal') }
  const tx = { player: () => ({ user: { get: async () => ({ faiths: ['测试'] }) }, progress: async () => business.initialStats() }) }
  await service.start(room, tx)
  assert.equal(room.state.players[0].uid, room.state.current)
  assert.match(room.state.players[0].name, /^1号·/)
  assert.deepEqual(room.state.order, room.state.players.map((player) => player.uid))
  for (const [index, player] of room.state.players.entries()) assert.match(player.name, new RegExp(`^${index + 1}号·`))
})

test('join response stays three lines while explicit room view keeps the full roster', () => {
  const service = new business.RouletteService({}, {}, business.DEFAULT_ROULETTE_CONFIG)
  const room = { state: business.initialState('normal'), status: 'waiting', creator: 1, min: 4, max: 12,
    members: Array.from({ length: 12 }, (_, i) => ({ uid: i + 1, name: `玩家${i + 1}`, ticket: {} })) }
  const joined = service.render(room, { action: 'join', uid: 12 }).content
  assert.equal(joined, '加入成功：玩家12\n人数：12/12（至少4人）\n房主：玩家1')
  assert.equal(joined.split('\n').length, 3)
  assert.doesNotMatch(joined, /玩家2/)
  assert.match(service.render(room).content, /玩家2/)
  assert.match(service.render(room, { action: 'view', uid: 12 }).content, /玩家2/)
})

test('rules reject duplicate IDs and expose synchronous extension hooks', () => {
  const rules = new business.RouletteRegistry()
  rules.registerPath({ id: 'test', name: '测试', description: 'test' })
  assert.throws(() => rules.registerPath({ id: 'test', name: '测试', description: 'test' }))
  const calls = []
  const handle = rules.registerHook({ id: 'hook', phase: 'start', apply: () => calls.push(1) })
  const player = { path: '测试', flags: {} }
  rules.emit('start', { state: {}, actor: player, target: player })
  handle.dispose()
  rules.emit('start', { state: {}, actor: player, target: player })
  assert.deepEqual(calls, [1])
})

test('v2 level progression keeps normal cap, level-nine gambler discount and max reward transition', () => {
  const stats = business.initialStats()
  stats.level = 5
  business.advanceStats(stats, 'normal', 1)
  assert.equal(stats.exp, 0)
  stats.level = 9
  business.advanceStats(stats, 'gambler', 1)
  assert.equal(stats.exp, 2)
  stats.exp = 69
  assert.equal(business.advanceStats(stats, 'crazy', 1), true)
  assert.equal(stats.level, 10)
  assert.equal(business.advanceStats(stats, 'crazy', 1), false)
  assert.equal(stats.honor, 1)
})

test('all builtin fields and paths survive seeded timeout simulations', () => {
  const service = new business.RouletteService({}, {}, business.DEFAULT_ROULETTE_CONFIG)
  let seed = 123
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 }
  const engine = new business.RouletteEngine(service.rules, random)
  for (const field of ['', ...service.rules.listFields().map((f) => f.id)]) {
    for (let run = 0; run < 20; run++) {
      const state = business.initialState(field ? 'crazy' : 'normal')
      state.field = field
      state.extra = run % 3 === 0 ? 'whispers' : run % 3 === 1 ? 'take_all' : ''
      state.dealer = 1
      state.players = service.rules.listPaths().map((path, i) => ({
        uid: i + 1, name: path.name, path: path.name, level: 1, alive: true, timeouts: 0, chambers: [], penalty: {},
        flags: { disabled: 0, instability: 0, fear: 0, lifeCooldown: 0, lifeSave: 0, lifeUsed: 0, shields: 0 },
      }))
      engine.start(state)
      for (let turn = 0; turn < 20 && state.players.filter((p) => p.alive).length > 1; turn++) engine.act(state, state.current, '开枪', true)
      assert.ok(state.players.filter((p) => p.alive).length <= 1, field)
      assert.equal(state.players.length, 6)
      assert.equal(new Set(state.deaths).size, state.deaths.length)
      for (const p of state.players) assert.ok(Object.values(p.penalty).every(Number.isSafeInteger))
    }
  }
})

test('a shield source rolls once regardless of layers, consumes only on success, before saves', () => {
  const calls = [], consumed = []
  const shield = { id: 'shield', kind: 'shield', available: () => 5, probability: () => .5,
    consume: (_c, layers) => consumed.push(['shield', layers]) }
  const save = { id: 'save', kind: 'save', available: () => 1, probability: () => .5,
    consume: (_c, layers) => consumed.push(['save', layers]) }
  const c = { damage: 3, random: () => { calls.push(1); return .1 } }
  business.resolveProtections(c, [save, shield, shield], false)
  assert.equal(c.damage, 0)
  assert.equal(calls.length, 1)
  assert.deepEqual(consumed, [['shield', 3]])
  calls.length = 0; consumed.length = 0; c.damage = 3
  c.random = () => { calls.push(1); return .9 }
  business.resolveProtections(c, [shield, shield], false)
  assert.equal(c.damage, 3)
  assert.equal(calls.length, 1)
  assert.deepEqual(consumed, [])
})

test('protection callbacks reject invalid layers, probability and async effects', () => {
  const c = { damage: 1, random: () => 0 }
  const source = { id: 'test', kind: 'shield', available: () => 1, probability: () => 1, consume() {} }
  assert.throws(() => business.resolveProtections(c, [{ ...source, available: () => -1 }], false))
  assert.throws(() => business.resolveProtections(c, [{ ...source, probability: () => 2 }], false))
  assert.throws(() => business.resolveProtections(c, [{ ...source, consume: async () => {} }], false))
})

test('independent saves stop on first success normally and become shields before crazy field shields', () => {
  const consumed = []
  const source = (id, kind, layers, fallback = false) => ({ id, kind, fallback, available: () => layers, probability: () => .5,
    consume: (_c, n) => consumed.push([id, n]) })
  const a = source('a', 'save', 1), b = source('b', 'save', 1), field = source('field', 'shield', 4, true)
  let rolls = [.9, .1]
  const c = { damage: 3, random: () => rolls.shift() }
  business.resolveProtections(c, [a, b], false)
  assert.equal(c.damage, 0)
  assert.deepEqual(consumed, [['b', 1]])
  consumed.length = 0; rolls = [.1, .1, .1]; c.damage = 3
  business.resolveProtections(c, [field, a, b], true)
  assert.equal(c.damage, 0)
  assert.deepEqual(consumed, [['a', 1], ['b', 1], ['field', 1]])
  assert.equal(rolls.length, 0)
})

test('built-in crazy protections use player saves before the field; failed sinking saves retain charges', () => {
  const service = new business.RouletteService({}, {}, business.DEFAULT_ROULETTE_CONFIG)
  const player = { uid: 1, alive: true, path: '沉沦', flags: { unwaveringSave: 2, civilizationSave: 1, shields: 3 } }
  const c = { actor: player, target: player, state: { field: 'crazy', players: [player] }, damage: 3,
    messages: [], random: () => .1 }
  service.rules.emit('bullet', c)
  assert.equal(c.damage, 0)
  assert.equal(player.flags.shields, 3)
  assert.equal(player.flags.unwaveringSave, 0)
  assert.equal(player.flags.civilizationSave, 0)
  player.flags.unwaveringSave = 1; c.state.field = ''; c.damage = 1; c.random = () => .99
  service.rules.emit('bullet', c)
  assert.equal(c.damage, 1)
  assert.equal(player.flags.unwaveringSave, 1)
})

function settlementFixture(alive, level = 1, exp = 0) {
  const s = business.initialState('crazy')
  s.players = [1, 2].map((uid) => ({ uid, name: `玩家${uid}`, alive: alive && uid === 1, penalty: {}, level: 1 }))
  s.deaths = alive ? [2] : [1, 2]; s.feePool = 200; s.pool = { gold: 300, ascension_score: 150 }
  const credits = [], stats = new Map(s.players.map((p) => [p.uid, { ...business.initialStats(), level, exp }]))
  const tx = { player(uid) { return {
    economy: { creditFixed: async (money) => credits.push({ uid, money }) }, user: { change: async () => {} },
    progress: async () => stats.get(uid), saveProgress: async (value) => stats.set(uid, value),
  } } }
  const service = new business.RouletteService({ economy: { previewReward: async (_uid, money) => ({ applied: money }) } }, {}, business.DEFAULT_ROULETTE_CONFIG)
  const room = { id: 'settlement', state: s, status: 'ended', members: s.players.map((p) => ({ uid: p.uid, ticket: {} })), log: [] }
  return { s, tx, service, room, credits, stats }
}

test('total elimination gives neither prize nor winner experience and settlement is idempotent', async () => {
  const f = settlementFixture(false)
  await f.service.finish(f.room, f.tx, false)
  assert.deepEqual(f.credits, [])
  assert.deepEqual(f.s.rewards, [])
  assert.ok(f.s.logs.includes(business.rouletteText.noWinner))
  for (const stats of f.stats.values()) { assert.equal(stats.exp, 0); assert.equal(stats.plays, 1); assert.equal(stats.crazy.wins, 0) }
  await f.service.finish(f.room, f.tx, false)
  assert.equal(f.stats.get(1).plays, 1)
})

test('upgrades are included in the final result and only max level supplies a broadcast announcement', async () => {
  const ordinary = settlementFixture(true, 1, 9)
  await ordinary.service.finish(ordinary.room, ordinary.tx, false)
  assert.match(ordinary.service.render(ordinary.room).content, /轮盘等级 1 → 2/)
  assert.equal(ordinary.service.announcement(ordinary.room), undefined)
  const max = settlementFixture(true, 9, 69)
  await max.service.finish(max.room, max.tx, false)
  assert.match(max.service.render(max.room).content, /轮盘满级/)
  assert.match(max.service.announcement(max.room).content, /玩家1/)
  assert.equal(max.service.render(max.room).broadcast, undefined)
})
