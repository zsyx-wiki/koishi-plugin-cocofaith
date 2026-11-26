/** Compatibility values keep their old shape, but allocate their closure only when used. */
export function lazyCompatibilityValue<T extends object>(create: () => T, target = {} as T): T {
  let value: T | undefined;
  const current = () => {
    if (!value) {
      value = create();
      if (Array.isArray(target) && Array.isArray(value)) target.length = value.length;
    }
    return value;
  };
  return new Proxy(target, {
    get(_target, key) {
      return Reflect.get(current(), key);
    },
    set(_target, key, next) {
      return Reflect.set(current(), key, next);
    },
    has(_target, key) {
      return Reflect.has(current(), key);
    },
    ownKeys() {
      return Reflect.ownKeys(current());
    },
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), key);
      return descriptor
        ? { ...descriptor, configurable: Array.isArray(target) && key === "length" ? false : true }
        : undefined;
    },
  });
}
