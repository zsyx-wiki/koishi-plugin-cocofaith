/** Keep legacy values lazy without changing their observable object/array shape. */
export function lazyCompatibilityValue<T extends object>(create: () => T, target = {} as T): T {
  let value: T | undefined;
  const synchronize = () => {
    for (const key of Reflect.ownKeys(target)) {
      if (!Object.hasOwn(value!, key)) Reflect.deleteProperty(target, key);
    }
    Object.defineProperties(target, Object.getOwnPropertyDescriptors(value!));
  };
  const current = () => {
    if (!value) {
      value = create();
      Reflect.setPrototypeOf(target, Reflect.getPrototypeOf(value));
      synchronize();
      if (!Reflect.isExtensible(value)) Reflect.preventExtensions(target);
    }
    return value;
  };
  return new Proxy(target, {
    get(_target, key, receiver) {
      return Reflect.get(current(), key, receiver);
    },
    set(_target, key, next) {
      if (!Reflect.set(current(), key, next)) return false;
      synchronize();
      return true;
    },
    has(_target, key) {
      return Reflect.has(current(), key);
    },
    ownKeys() {
      return Reflect.ownKeys(current());
    },
    getOwnPropertyDescriptor(_target, key) {
      return Reflect.getOwnPropertyDescriptor(current(), key);
    },
    defineProperty(_target, key, descriptor) {
      if (!Reflect.defineProperty(current(), key, descriptor)) return false;
      synchronize();
      return true;
    },
    deleteProperty(_target, key) {
      if (!Reflect.deleteProperty(current(), key)) return false;
      synchronize();
      return true;
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(current());
    },
    setPrototypeOf(_target, prototype) {
      return (
        Reflect.setPrototypeOf(current(), prototype) && Reflect.setPrototypeOf(target, prototype)
      );
    },
    isExtensible() {
      current();
      return Reflect.isExtensible(target);
    },
    preventExtensions() {
      Reflect.preventExtensions(current());
      synchronize();
      return Reflect.preventExtensions(target);
    },
  });
}
