import { Platform } from "react-native";
import Constants from "expo-constants";
import type { Medication, MedicationOrder, Patient, ScanLog } from "./types";

function resolveApiBase() {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envBase) return envBase;

  const hostUri =
    (Constants.expoConfig as { hostUri?: string } | undefined)?.hostUri ||
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `http://${host}:4000`;
    }
  }

  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  if (Platform.OS === "ios") return "http://localhost:4000";
  return "http://localhost:4000";
}

const API_BASE = resolveApiBase();

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers((init?.headers as HeadersInit) ?? {});
  headers.set("bypass-tunnel-reminder", "1");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: r.statusText }));
      throw new Error((err as { message?: string }).message ?? r.statusText);
    }
    return r.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

export async function nurseLogin(id: string, password: string) {
  return req<{ token: string; user: { id: string; name: string; role: string } }>(
    "/auth/login",
    jsonBody("POST", { id, password, role: "nurse" })
  );
}

export const getPatient = (id: string) => req<Patient>(`/patients/${id}`);
export const getPatients = () => req<Patient[]>("/patients");
export const getOrders = () => req<MedicationOrder[]>("/orders");
export const getMedications = () => req<Medication[]>("/medications");

export async function createOrder(payload: {
  patientId: string;
  medicationId: string;
  prescribedDose: string;
  prescribedRoute: string;
  scheduledTime: string;
  prescriptionId: string;
  active: boolean;
}) {
  return req<MedicationOrder>("/orders", jsonBody("POST", payload));
}

export async function createScanLog(payload: {
  nurseId: string;
  patientId: string;
  medicationId: string;
  orderId?: string;
  errorTypes: string[];
}) {
  return req<ScanLog>("/logs", jsonBody("POST", payload));
}

export async function submitPostEval(logId: string, adverseReaction: boolean, evalNotes?: string) {
  return req<{ id: string; adverseReaction: boolean; evalNotes?: string; evalTime: string }>(
    `/logs/${logId}/eval`,
    jsonBody("PATCH", { adverseReaction, evalNotes })
  );
}

export async function getMyLogs(nurseId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const logs = await req<ScanLog[]>(`/logs?from=${today}`);
  return logs.filter((l) => l.nurseId === nurseId);
}
