// ── 14 Rights (8 auto-verified, 6 manual) ────────────────────────────────────

export type AutoRightKey =
  | "rightPatient"
  | "rightDrug"
  | "rightDose"
  | "rightRoute"
  | "rightTime"
  | "rightPrescription"
  | "rightNurseClinician"
  | "rightDocumentation";

export type ManualRightKey =
  | "rightAssessment"
  | "rightEducation"
  | "rightApproach"
  | "rightPrincipleOfCare"
  | "rightEvaluation"
  | "rightToRefuse";

export type MedAlertStatus = "on-time" | "due-soon" | "overdue";

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  ward: string;
  bed: string | null;
  allergyStatus: "none" | "present";
  allergies: string | null;
  patientStatus: "active" | "discharged" | "transferred";
  attendingPhysicianId: string | null;
  admissionDate: string | null;
}

export interface Medication {
  id: string;
  code: string;
  name: string;
  dose: string;
  route: string;
}

export interface MedicationOrder {
  id: string;
  patientId: string;
  medicationId: string;
  prescribedDose: string;
  prescribedRoute: string;
  scheduledTime: string;
  prescriptionId: string;
  active: boolean;
  status: "pending" | "verified" | "dispensed";
}

export interface ScanLog {
  id: string;
  nurseId: string;
  patientId: string;
  medicationId: string;
  orderId?: string;
  timestamp: string;
  errorTypes: string[];
  adverseReaction?: boolean;
  evalNotes?: string;
  evalTime?: string;
}

// ── Offline / local types ──────────────────────────────────────────────────────

export interface PendingLog {
  localId: string;
  nurseId: string;
  patientId: string;
  medicationId: string;
  orderId?: string;
  errorTypes: string[];
  timestamp: string;
}

export interface OfflineCache {
  orders: MedicationOrder[];
  medications: Medication[];
  cachedAt: string;
}

// ── Session ────────────────────────────────────────────────────────────────────

export interface NurseSession {
  nurseId: string;
  nurseName: string;
}
