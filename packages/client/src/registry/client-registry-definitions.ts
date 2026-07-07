/* eslint-disable @typescript-eslint/no-explicit-any */

type ClientRegistry<T extends Record<string, any>> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
} & {
  [K in keyof T as `set${Capitalize<string & K>}`]: (instance: T[K]) => void;
} & {
  [K in keyof T as `has${Capitalize<string & K>}`]: () => boolean;
} & {
  clear: () => void;
};

export function defineClientRegistry<T extends Record<string, unknown>>(
  keys: (keyof T)[]
): ClientRegistry<T> {
  const store: Partial<T> = {};
  const registry: any = {};

  for (const key of keys) {
    const name = String(key);
    const capital = name[0].toUpperCase() + name.slice(1);

    registry[`get${capital}`] = () => {
      const instance = store[key];
      if (!instance) throw new Error(`${capital} is not initialized`);
      return instance;
    };

    registry[`set${capital}`] = (instance: T[typeof key]) => {
      (store as T)[key] = instance;
    };

    registry[`has${capital}`] = () => !!store[key];
  }

  registry.clear = () => {
    for (const key of keys) {
      delete store[key];
    }
  };

  return registry;
}
