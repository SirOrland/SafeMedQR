import type { AlertThreshold, Medication, MedicationOrder, OrderStatus, Patient, Role, ScanLog, User } from "./types";

const API_BASE =
  (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, init);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ message: r.statusText }));
    throw new Error(err.message ?? r.statusText);
  }
  return r.json();
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(id: string, password: string, role?: Role) {
  return req<{ token: string; user: { id: string; name: string; role: Role } }>(
    "/auth/login", json("POST", { id, password, role })
  );
}

// ── Users ────────────────────────────────────────────────────────────────────

export const getUsers = () => req<User[]>("/users");
export const createUser = (body: { name: string; role: Role; password: string }) =>
  req<User>("/users", json("POST", body));
export const setUserActive = (id: string, active: boolean) =>
  req<{ id: string; active: boolean }>(`/users/${id}/active`, json("PATCH", { active }));
export const changeUserPassword = (id: string, password: string) =>
  req<{ id: string; message: string }>(`/users/${id}/password`, json("PATCH", { password }));

// ── Patients ──────────────────────────────────────────────────────────────────

export const getPatients = () => req<Patient[]>("/patients");
export const getNextMrn = () => req<{ mrn: string }>("/patients/next-mrn");
export const createPatient = (body: Omit<Patient, "id" | "mrn"> & { mrn?: string }) =>
  req<Patient>("/patients", json("POST", body));
export const updatePatient = (id: string, body: Partial<Patient>) =>
  req<Patient>(`/patients/${id}`, json("PUT", body));
export const deletePatient = (id: string) => req<Patient>(`/patients/${id}`, { method: "DELETE" });

// ── Medications ───────────────────────────────────────────────────────────────

export const getMedications = () => req<Medication[]>("/medications");
export const createMedication = (body: Omit<Medication, "id" | "code">) =>
  req<Medication>("/medications", json("POST", body));
export const updateMedication = (id: string, body: Partial<Medication>) =>
  req<Medication>(`/medications/${id}`, json("PUT", body));
export const deleteMedication = (id: string) => req<Medication>(`/medications/${id}`, { method: "DELETE" });

// ── Orders ────────────────────────────────────────────────────────────────────

export const getOrders = () => req<MedicationOrder[]>("/orders");
export const createOrder = (body: Omit<MedicationOrder, "id" | "status">) =>
  req<MedicationOrder>("/orders", json("POST", body));
export const updateOrder = (id: string, body: Partial<MedicationOrder>) =>
  req<MedicationOrder>(`/orders/${id}`, json("PUT", body));
export const updateOrderStatus = (id: string, status: OrderStatus) =>
  req<MedicationOrder>(`/orders/${id}/status`, json("PATCH", { status }));
export const deleteOrder = (id: string) => req<MedicationOrder>(`/orders/${id}`, { method: "DELETE" });

// ── Logs ──────────────────────────────────────────────────────────────────────

export function getLogs(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const q = params.toString();
  return req<ScanLog[]>(`/logs${q ? `?${q}` : ""}`);
}

// ── Alert Thresholds ──────────────────────────────────────────────────────────

export const getThresholds = () => req<AlertThreshold[]>("/alerts/thresholds");
export const updateThreshold = (id: string, thresholdValue: number) =>
  req<AlertThreshold>(`/alerts/thresholds/${id}`, json("PUT", { thresholdValue }));
