const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const { generateGameplays } = require("../../scripts/generate-gameplays.cjs");
const business = require("../../lib/business/index.js");

function addGameplay(root, name) {
  const directory = path.join(root, "src/business/modules", name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.ts"), `export default defineBuiltInGameplay({ name: "${name.replaceAll("-", "_")}", description: "${name}", create: () => ({ name: "${name}" }) });\n`);
}

test("a gameplay is discovered from its own entry without editing central catalogs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cocofaith-discovery-"));
  try {
    addGameplay(root, "first");
    generateGameplays(root);
    addGameplay(root, "new-game");
    assert.deepEqual(generateGameplays(root), ["first", "new-game"]);
    const file = path.join(root, "src/business/modules/catalog.ts");
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /export \* from "\.\/new-game"/);
    const definitions = {
      "./first": business.defineBuiltInGameplay({
        name: "first",
        description: "first",
        order: 1,
        create: () => ({ name: "first" }),
      }),
      "./new-game": business.defineBuiltInGameplay({
        name: "new_game",
        description: "new",
        config: {
          key: "customKey",
          definition: business.defineGameplayConfig({ amount: business.gameplayInteger(5) }),
        },
        create: () => ({ name: "new_game" }),
      }),
    };
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    new Function("require", "exports", "module", compiled)(
      (name) => (name === "../framework/built-in" ? business : { default: definitions[name] }),
      module.exports,
      module,
    );
    const collected = module.exports.BUILT_IN_GAMEPLAYS;
    assert.deepEqual(
      collected.map((entry) => business.createBuiltInBusinessModule(entry).name),
      ["first", "new_game"],
    );
    assert.equal(business.builtInConfigs(collected).customKey.definition.defaults.amount, 5);
    assert.equal(fs.readFileSync(file, "utf8"), source);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("discovery rejects incomplete entries; declarations reject name and config collisions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cocofaith-discovery-"));
  try {
    addGameplay(root, "incomplete");
    fs.writeFileSync(
      path.join(root, "src/business/modules/incomplete/index.ts"),
      "export const something = 1",
    );
    assert.throws(() => generateGameplays(root), /默认导出/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const make = (name, key) =>
    business.defineBuiltInGameplay({
      name,
      description: name,
      create: () => ({ name }),
      config: { key, definition: business.defineGameplayConfig({}) },
    });
  assert.throws(
    () => business.collectBuiltInGameplays([make("same", "a"), make("same", "b")]),
    /名称/,
  );
  assert.throws(
    () => business.collectBuiltInGameplays([make("a", "same"), make("b", "same")]),
    /配置键/,
  );
});

test("built-in discovery preserves module order and existing configuration keys", () => {
  assert.deepEqual(
    business.createBuiltInBusinessModules().map((module) => module.name),
    [
      "faith",
      "faith_admin",
      "void_prayer",
      "daily_prayer",
      "junk",
      "title",
      "rooms",
      "roulette",
      "about",
      "collection",
      "binding",
      "club",
      "container",
    ],
  );
  assert.deepEqual(Object.keys(business.builtInConfigs(business.BUILT_IN_GAMEPLAYS)), [
    "faith",
    "voidPrayer",
    "dailyPrayer",
    "junk",
    "roulette",
    "binding",
    "club",
    "container",
  ]);
});

test("advanced command tables retain routing, scene restrictions and stable IDs", async () => {
  const module = business.defineAdvancedGameplay({
    name: "advanced_table_probe",
    commands: {
      root: {
        triggers: ["测试"],
        children: {
          value: { triggers: ["值"], scenes: ["group"], run: ({ args }) => args.join(" ") },
        },
      },
    },
  });
  const router = new business.BusinessCommandRouter();
  router.register(module.name, module.commands);
  const event = { content: "测试 值 a b", scene: "group", uid: 1 };
  const matched = router.resolve(event);
  assert.equal(matched.commandId, "root.value");
  assert.equal((await matched.command.execute({ args: matched.args })).content, "a b");
  assert.throws(() => router.resolve({ ...event, scene: "private" }), {
    code: "COMMAND_SCENE_FORBIDDEN",
  });
});

test("a local declaration supplies runtime configuration without a second config registry", () => {
  const definition = business.defineBuiltInGameplay({
    name: "local_config",
    description: "local",
    config: {
      key: "localConfig",
      definition: business.defineGameplayConfig({ count: business.gameplayInteger(3, { min: 1 }) }),
    },
    create: () => ({ name: "local_config" }),
  });
  const module = business.createBuiltInBusinessModule(definition);
  const store = new business.BusinessConfigStore({
    modules: { local_config: { config: { count: 7 } } },
  });
  assert.equal(store.resolve(module).count, 7);
  assert.equal(module.defaultConfig.count, 3);
  store.update(module.name, { count: 0 });
  assert.throws(() => store.resolve(module), { code: "CONFIG_INVALID" });
});

test('generated configuration loads schemas without importing gameplay factories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocofaith-config-discovery-'))
  try {
    addGameplay(root, 'config-probe')
    fs.writeFileSync(path.join(root, 'src/business/modules/config-probe/index.ts'), `
      import { SETTINGS } from './config';
      export default defineBuiltInGameplay({ name: 'config_probe', description: 'probe',
        config: { key: 'probeConfig', definition: SETTINGS }, create: createProbe });
    `)
    generateGameplays(root)
    const source = fs.readFileSync(path.join(root, 'src/business/config-catalog.ts'), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const module = { exports: {} }
    new Function('require', 'exports', compiled)(name => {
      if (name === './framework/built-in') return business
      assert.equal(name, './modules/config-probe/config', 'configuration must never load a gameplay implementation')
      return { SETTINGS: business.defineGameplayConfig({ amount: business.gameplayInteger(7) }) }
    }, module.exports)
    assert.equal(module.exports.BUILT_IN_CONFIGS.probeConfig.definition.defaults.amount, 7)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('legacy module and list values create their closures once on first use', () => {
  const file = path.resolve(__dirname, '../../src/business/framework/compatibility.ts')
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exported = {}
  new Function('exports', compiled)(exported)
  let created = 0
  const legacy = exported.lazyCompatibilityValue(() => { created++; return { name: 'probe', execute: () => created } })
  assert.equal(created, 0)
  assert.equal(legacy.name, 'probe')
  assert.equal(legacy.execute(), 1)
  assert.equal({ ...legacy }.name, 'probe')
  assert.equal(created, 1)
  let lists = 0
  const list = exported.lazyCompatibilityValue(() => { lists++; return [legacy] }, [])
  assert.equal(lists, 0)
  assert.ok(Array.isArray(list))
  assert.equal(list.length, 1)
  assert.deepEqual([...list], [legacy])
  assert.equal(lists, 1)
})
