import { ScopeStatus } from "cordis";
import type { Context } from "koishi";
import type { Config } from "./config";
import * as corePlugin from "./core/plugin";
import * as businessPlugin from "./business/plugin";
import type { FaithCoreService } from "./core/service";
import type { FaithBusinessService } from "./business/framework/service";

class ServiceGeneration {
  core?: FaithCoreService;
  business?: FaithBusinessService;
  private readonly children: ReturnType<Context["plugin"]>[] = [];
  private stopping?: Promise<void>;

  mount(ctx: Context, config: Config) {
    this.children.push(ctx.plugin(corePlugin, config.core));
    this.children.push(ctx.plugin(businessPlugin, config.business));
  }

  stop(): Promise<void> {
    return this.stopping ??= this.release();
  }

  private async release() {
    const errors: unknown[] = [];
    // 等待玩法执行结束后，再释放业务作用域和 Core 资源。
    for (const task of [
      () => this.business?.shutdown(),
      () => this.business?.lifecycle.dispose(),
      () => this.core?.lifecycle.dispose(),
    ]) {
      try { await task(); } catch (error) { errors.push(error); }
    }
    for (const child of this.children.splice(0).reverse()) {
      try { child.dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "CoCoFaith 卸载失败");
  }
}

export function composeServices(ctx: Context, config: Config) {
  if (ctx.get("faithCore") || ctx.get("faithBusiness")) {
    throw new Error("请先停用旧 Core / Business 或其他同名服务，再启用 CoCoFaith。");
  }
  let current = new ServiceGeneration();
  let disposed = false;
  let failing = false;
  let updates: Promise<void> = Promise.resolve();

  ctx.on("internal/service", function (this: Context, service) {
    if (service !== "faithCore" && service !== "faithBusiness") return;
    if (this.scope.runtime.parent.scope !== ctx.scope) return;
    if (service === "faithCore" && Object.is(this.scope.runtime.plugin, corePlugin)) {
      current.core = this.get(service) ?? current.core;
    } else if (service === "faithBusiness" && Object.is(this.scope.runtime.plugin, businessPlugin)) {
      current.business = this.get(service) ?? current.business;
    }
  });
  ctx.on("dispose", async () => {
    disposed = true;
    await updates.catch(() => undefined);
    await current.stop();
  });
  ctx.on("internal/status", scope => {
    if (disposed || failing || scope.status !== ScopeStatus.FAILED) return;
    // apply() 同步失败时，ctx.plugin() 可能尚未返回子插件句柄。
    if (scope.runtime.parent.scope !== ctx.scope) return;
    if (!Object.is(scope.runtime.plugin, corePlugin) && !Object.is(scope.runtime.plugin, businessPlugin)) return;
    failing = true;
    const error = scope.error ?? new Error("CoCoFaith 子插件启动失败");
    ctx.scope.ensure(async () => {
      try { await current.stop(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], "CoCoFaith 启动及清理失败"); }
      throw error;
    });
  });
  ctx.accept(next => {
    updates = updates.then(async () => {
      await current.stop();
      if (disposed) return;
      current = new ServiceGeneration();
      current.mount(ctx, next);
    });
    ctx.scope.ensure(() => updates);
  });
  current.mount(ctx, config);
}
