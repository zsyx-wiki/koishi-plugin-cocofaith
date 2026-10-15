const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const business = require("../../lib/business/index.js");
const { createGameplayTestHarness } = require("cocofaith-sdk/testing");

test("recommended example declares its configuration and atomically enforces a daily reward", async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/business/examples/simple-gameplay.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const example = { exports: {} };
  new Function("require", "exports", compiled)(
    (name) => (name.startsWith("../framework/") ? business : require(name)),
    example.exports,
  );
  const declaration = example.exports.default;
  const gameplay = example.exports.simpleGameplayExample;
  const module = business.createBuiltInBusinessModule(declaration);
  assert.equal(module.name, gameplay.name);
  assert.equal(module.validateConfig({ rewardGold: 75 }).rewardGold, 75);
  assert.throws(() => module.validateConfig({ rewardGold: -1 }));
  const host = createGameplayTestHarness(gameplay, {
    gold: 0,
    config: { rewardGold: 75 },
    gameDay: "2026-10-15",
  });
  try {
    assert.deepEqual(await host.run("play", [], { eventId: "first" }), {
      type: "text",
      content: "摸鱼成功，获得 75 金币。",
    });
    const saved = host.snapshot();
    await assert.rejects(host.run("play", [], { eventId: "second" }), { code: "LIMIT_REACHED" });
    assert.deepEqual(host.snapshot(), saved);
    host.setGameDay("2026-10-16");
    await host.run("play", [], { eventId: "third" });
    assert.equal(host.snapshot().gold, 150);
  } finally {
    await host.dispose();
  }
});
