import { Platform } from "react-native";

type JsonValue = unknown;

const memoryStore = new Map<string, string>();
type NativeStorage = typeof import("@react-native-async-storage/async-storage").default;
let nativeStoragePromise: Promise<NativeStorage> | null = null;

const getNativeStorage = () => {
  nativeStoragePromise ??= import("@react-native-async-storage/async-storage").then(
    ({ default: storage }) => storage,
  );
  return nativeStoragePromise;
};

const hasWebLocalStorage = () =>
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined";

const useMemoryStore = () => (Platform.OS as string) === "test";

export const jsonStorage = {
  async get<T extends JsonValue>(key: string): Promise<T | null> {
    let raw: string | null;
    if (hasWebLocalStorage()) {
      raw = window.localStorage.getItem(key);
    } else if (useMemoryStore()) {
      raw = memoryStore.get(key) ?? null;
    } else {
      raw = await (await getNativeStorage()).getItem(key);
    }

    if (!raw) return null;
    return JSON.parse(raw) as T;
  },

  async set<T extends JsonValue>(key: string, value: T): Promise<void> {
    const raw = JSON.stringify(value);

    if (hasWebLocalStorage()) {
      window.localStorage.setItem(key, raw);
      return;
    }

    if (useMemoryStore()) {
      memoryStore.set(key, raw);
      return;
    }

    await (await getNativeStorage()).setItem(key, raw);
  },

  async remove(key: string): Promise<void> {
    if (hasWebLocalStorage()) {
      window.localStorage.removeItem(key);
      return;
    }

    if (useMemoryStore()) {
      memoryStore.delete(key);
      return;
    }

    await (await getNativeStorage()).removeItem(key);
  },

  async clear(): Promise<void> {
    if (hasWebLocalStorage()) {
      window.localStorage.clear();
      return;
    }

    if (useMemoryStore()) {
      memoryStore.clear();
      return;
    }

    const storage = await getNativeStorage();
    const appKeys = (await storage.getAllKeys()).filter((key) =>
      key.startsWith("infinite-canvas:"),
    );
    await storage.multiRemove(appKeys);
  },
};
