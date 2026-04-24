export type Role = "nurse" | "admin" | "doctor" | "pharmacist" | "chief_nurse";
export type OrderStatus = "pending" | "verified" | "dispensed";

export interface User {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}

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
  status: OrderStatus;
}

export interface ScanLog {
  id: string;
  nurseId: string;
  patientId: string;
  medicationId: string;
  orderId?: string;
  timestamp: string;
  errorTypes: string[];
}

export interface AlertThreshold {
  id: string;
  metric: string;
  thresholdValue: number;
  updatedAt: string;
}
