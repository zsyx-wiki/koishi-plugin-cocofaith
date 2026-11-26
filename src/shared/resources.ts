import type { FaithDisposable } from "cocofaith-sdk/core";

/** A single owner's resource list. Owners decide when to close admission and when to release. */
export class ResourceList {
  private resources: FaithDisposable[] = [];

  track<T extends FaithDisposable>(resource: T): T {
    this.resources = this.resources.filter((entry) => !entry.disposed);
    if (!resource.disposed) this.resources.push(resource);
    return resource;
  }

  async release(): Promise<unknown[]> {
    const failures: unknown[] = [];
    for (const resource of this.resources.splice(0).reverse()) {
      try {
        await resource.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    return failures;
  }
}
