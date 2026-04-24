import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OfflineCache, PendingLog } from "./types";

const KEY_CACHE = "smqr_cache";
const KEY_PENDING = "smqr_pending";

// ── Offline data cache ────────────────────────────────────────────────────────

export async function saveCache(cache: OfflineCache) {
  await AsyncStorage.setItem(KEY_CACHE, JSON.stringify(cache));
}

export async function loadCache(): Promise<OfflineCache | null> {
  const raw = await AsyncStorage.getItem(KEY_CACHE);
  if (!raw) return null;
  try { return JSON.parse(raw) as OfflineCache; } catch { return null; }
}

export async function clearCache() {
  await AsyncStorage.removeItem(KEY_CACHE);
}

// ── Pending log queue (for offline administration events) ────────────────────

export async function enqueuePendingLog(log: Omit<PendingLog, "localId">) {
  const existing = await getPendingLogs();
  const entry: PendingLog = {
    ...log,
    localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  };
  await AsyncStorage.setItem(KEY_PENDING, JSON.stringify([...existing, entry]));
  return entry;
}

export async function getPendingLogs(): Promise<PendingLog[]> {
  const raw = await AsyncStorage.getItem(KEY_PENDING);
  if (!raw) return [];
  try { return JSON.parse(raw) as PendingLog[]; } catch { return []; }
}

export async function removePendingLogs(localIds: string[]) {
  const existing = await getPendingLogs();
  const remaining = existing.filter((l) => !localIds.includes(l.localId));
  await AsyncStorage.setItem(KEY_PENDING, JSON.stringify(remaining));
}

export async function clearAllLocalData() {
  await AsyncStorage.multiRemove([KEY_CACHE, KEY_PENDING]);
}
