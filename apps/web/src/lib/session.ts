import { browser } from "$app/environment";
import { writable } from "svelte/store";

export type Role = "admin" | "doctor" | "pharmacist" | "chief_nurse" | "nurse";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export interface Session {
  token: string;
  user: SessionUser;
}

const STORAGE_KEY = "safemedsqr_session";

function loadStored(): Session | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export const session = writable<Session | null>(loadStored());

if (browser) {
  session.subscribe((val) => {
    if (val) localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    else localStorage.removeItem(STORAGE_KEY);
  });
}

export function clearSession() {
  session.set(null);
}

export const ROLE_ROUTES: Record<Role, string> = {
  admin:       "/dashboard/admin",
  doctor:      "/dashboard/doctor",
  pharmacist:  "/dashboard/pharmacy",
  chief_nurse: "/dashboard/supervisor",
  nurse:       "/dashboard/nurse",
};
