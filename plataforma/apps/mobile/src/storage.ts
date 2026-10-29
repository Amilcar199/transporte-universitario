import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Guarda o refresh token. No telemóvel usa o armazenamento seguro do sistema (Keychain/Keystore).
 * No browser não existe equivalente: usa sessionStorage, que termina ao fechar o separador.
 */
export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.sessionStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return globalThis.sessionStorage?.setItem(key, value);
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") return globalThis.sessionStorage?.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};
