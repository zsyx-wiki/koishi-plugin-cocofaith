const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cocofaith-package-'))
const consumer = path.join(workspace, 'consumer')
fs.mkdirSync(consumer)
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', timeout: 180000, killSignal: 'SIGKILL' })
}
const [packed] = JSON.parse(run(npm, ['pack', '--json', '--ignore-scripts', '--cache', path.join(os.tmpdir(), 'cocofaith-package-npm-cache'), '--pack-destination', workspace], root, true))
const publishedSdk = process.env.COCOFAITH_SDK_FROM_REGISTRY === '1'
const sdkRoot = process.env.COCOFAITH_SDK_PATH || (fs.existsSync(path.join(root, '.test-deps/sdk/package.json'))
  ? path.join(root, '.test-deps/sdk') : path.resolve(root, '../cocofaith-sdk'))
const sdkPackages = publishedSdk ? [] : JSON.parse(run(npm, ['pack', '--json', '--ignore-scripts', '--cache', path.join(os.tmpdir(), 'cocofaith-package-npm-cache'), '--pack-destination', workspace], sdkRoot, true)).map(item => path.join(workspace, item.filename))
const files = packed.files.map(item => item.path)
for (const entry of ['index', 'core/index', 'business/index']) {
  for (const extension of ['js', 'mjs', 'd.ts', 'd.mts']) assert.ok(files.includes(`lib/${entry}.${extension}`), `missing ${entry}.${extension}`)
}
assert.ok(files.includes('assets/coconut-water.png'))
assert.ok(files.includes('LICENSE'))
assert.ok(files.includes('CHANGELOG.md'))
assert.ok(!files.some(file => file.startsWith('docs/')))
assert.ok(!files.some(file => /^(?:src|tests|node_modules|\.github)\//.test(file)))
fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, name: 'cocofaith-package-check', version: '1.0.0' }))
run(npm, ['install', '--fetch-retries=0', '--fetch-timeout=30000', '--no-audit', '--no-fund', '--package-lock=false', '--cache', path.join(os.tmpdir(), 'cocofaith-package-npm-cache'), path.join(workspace, packed.filename), ...sdkPackages, 'koishi@^4.16.0', '@minatojs/driver-sqlite@^4.7.0', '@types/node@^20.0.0'], consumer)
fs.writeFileSync(path.join(consumer, 'smoke.cjs'), `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { App } = require('koishi');
const plugin = require('koishi-plugin-cocofaith');
const metadata = require('koishi-plugin-cocofaith/package.json');
assert.equal(metadata.version, '${require('../package.json').version}');
assert.deepEqual(metadata.koishi.service.required, ['database', 'faithAdapter']);
assert.deepEqual(metadata.koishi.service.implements, ['faithCore', 'faithBusiness']);
(async () => {
  for (const entry of ['', '/core', '/business']) {
    require('koishi-plugin-cocofaith' + entry);
    await import('koishi-plugin-cocofaith' + entry);
  }
  for (const name of ['koishi-plugin-cocofaith-core', 'koishi-plugin-cocofaith-business']) {
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' });
  }
  const app = new App();
  const { provideFaithAdapter } = require('cocofaith-sdk/adapter');
  app.plugin({ name: 'test-adapter', apply(ctx) {
    provideFaithAdapter(ctx, { id: 'test', name: 'Test', platform: 'test', version: '1', mode: 'normal' });
  } });
  app.plugin(require('@minatojs/driver-sqlite').default, { path: ':memory:' });
  const fork = app.plugin(plugin, { core: { gameDay: { enabled: false } } });
  await app.start();
  const core = app.faithCore, business = app.faithBusiness;
  assert.equal(core.lifecycle.state, 'ready');
  const user = await core.faiths.registerUser({ adapter: 'onebot', type: 'qq_account', value: 'packed-user', scope: 'global' }, '诞育');
  const result = await business.dispatch({ uid: user.uid, scene: 'group', content: '捡垃圾', eventId: 'packed-event' });
  assert.ok(result.result, JSON.stringify(result));
  fork.dispose();
  await core.lifecycle.dispose();
  await app.events.flush();
  await app.stop();
  console.log('Installed tarball: CJS/ESM, services, gameplay and disposal passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
`)
fs.writeFileSync(path.join(consumer, 'consumer.ts'), `
import type { Context } from 'koishi';
import { Config, FaithCoreService, FaithBusinessService } from 'koishi-plugin-cocofaith';
import { defineGameplay, defineGameplayState, defineGameplayConfig, gameplayInteger } from 'cocofaith-sdk/gameplay';
import { defineAdvancedGameplay } from 'koishi-plugin-cocofaith/business';
import type { FaithCoreConfig } from 'koishi-plugin-cocofaith/core';
declare const ctx: Context;
const core: FaithCoreService = ctx.faithCore;
const adapters = ctx.faithAdapter.list();
const platform: string | undefined = adapters[0]?.platform;
const business: FaithBusinessService = ctx.faithBusiness;
business.register(defineGameplay({
  name: 'consumer',
  config: defineGameplayConfig({ amount: gameplayInteger(1) }),
  state: defineGameplayState({ fields: { count: gameplayInteger(0) } }),
  commands: { play: { triggers: ['test'], atomic: 'user', run({ state, config }) {
    state.data.count += config.amount;
    return String(state.data.count);
  } } },
}));
business.register(defineAdvancedGameplay({ name: 'advanced_consumer', commands: { play: { triggers: ['advanced'], run: () => 'ok' } } }));
`)
run(process.execPath, ['smoke.cjs'], consumer)
run(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--esModuleInterop', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts'], consumer)
console.log(`Package contents and independent install verified: ${packed.filename} (${files.length} files)`)
console.log(`Artifacts: ${workspace}`)
