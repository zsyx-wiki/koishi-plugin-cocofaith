const test = require("node:test");
const assert = require("node:assert/strict");
const { defineGameplay, adaptGameplayDefinition } = require("../../lib/business/index.js");

function context(config = {}) {
  return { name: "lifecycle_probe", config, core: { lifecycle: {} } };
}
const commands = { read: { triggers: ["read"], run: ({ service }) => String(service.value) } };

test("in-place reload retains service and registrations and restores configuration on failure", async () => {
  let instance,
    created = 0,
    disposed = 0,
    released = 0;
  const module = adaptGameplayDefinition(
    defineGameplay({
      name: "lifecycle_probe",
      setup(ctx) {
        ctx.track({
          dispose() {
            released++;
          },
        });
        created++;
        return (instance = { value: ctx.config.value });
      },
      reload(service, config) {
        assert.equal(service, instance);
        service.value = config.value;
        if (config.value === 3) throw new Error("bad configuration");
      },
      dispose() {
        disposed++;
      },
      commands,
    }),
  );
  await module.init(context({ value: 1 }));
  await module.ready(context({ value: 1 }));
  await module.reload(context({ value: 2 }), { value: 1 });
  assert.equal(instance.value, 2);
  await assert.rejects(module.reload(context({ value: 3 }), { value: 2 }), /bad configuration/);
  assert.equal(instance.value, 2);
  assert.equal(created, 1);
  assert.equal(released, 0);
  assert.equal(disposed, 0);
  await module.dispose();
  assert.equal(released, 1);
  assert.equal(disposed, 1);
});

test("failed in-place recovery marks the module unusable", async () => {
  const module = adaptGameplayDefinition(
    defineGameplay({
      name: "lifecycle_probe",
      setup: () => ({ value: 0 }),
      reload() {
        throw new Error("cannot configure");
      },
      commands,
    }),
  );
  await module.init(context());
  await assert.rejects(
    module.reload(context(), {}),
    (error) => error.details.rollbackFailed === true,
  );
  await module.dispose();
});

test("restart reload runs ready and cleans a failed ready before restoring the old service", async () => {
  const events = [];
  const module = adaptGameplayDefinition(
    defineGameplay({
      name: "lifecycle_probe",
      setup(ctx) {
        events.push(`setup:${ctx.config.value}`);
        return { value: ctx.config.value };
      },
      ready(service) {
        events.push(`ready:${service.value}`);
        if (service.value === 2) throw new Error("ready failed");
      },
      dispose(service) {
        events.push(`dispose:${service.value}`);
      },
      commands,
    }),
  );
  await module.init(context({ value: 1 }));
  await module.ready(context({ value: 1 }));
  await assert.rejects(module.reload(context({ value: 2 }), { value: 1 }), /ready failed/);
  assert.deepEqual(events, [
    "setup:1",
    "ready:1",
    "dispose:1",
    "setup:2",
    "ready:2",
    "dispose:2",
    "setup:1",
    "ready:1",
  ]);
  await module.dispose();
});

test("a failed binding setup releases its timer before the service can be returned", async () => {
  const business = require("../../lib/business/index.js");
  const interval = global.setInterval,
    clear = global.clearInterval;
  const created = new Set(),
    cleared = new Set();
  global.setInterval = (...args) => {
    const timer = interval(...args);
    created.add(timer);
    return timer;
  };
  global.clearInterval = (timer) => {
    cleared.add(timer);
    return clear(timer);
  };
  try {
    const module = business.createBindingModule();
    await assert.rejects(
      module.init({
        core: {
          lifecycle: {
            defer: (callback) => new (require("cocofaith-sdk/core").CallbackDisposable)(callback),
          },
        },
        config: business.DEFAULT_BINDING_CONFIG,
        name: "binding",
        provide() {
          throw new Error("registration failed");
        },
      }),
      /registration failed/,
    );
    assert.equal(created.size, 1);
    for (const timer of created) assert.ok(cleared.has(timer), "setup leaked its cleanup timer");
  } finally {
    for (const timer of created) clear(timer);
    global.setInterval = interval;
    global.clearInterval = clear;
  }
});
