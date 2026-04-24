import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import * as mysql from "mysql2/promise";
import pool from "./db.js";
import { runMigrations } from "./migrate.js";
import type { AlertThreshold, Medication, MedicationOrder, OrderStatus, Patient, Role, ScanLog, User } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());

const port = 4000;
const host = "0.0.0.0";

const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

function toMySQL(d: Date = new Date()) {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

const ar =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// ─── Health ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "SafeMedsQR API" });
});

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post("/auth/login", ar(async (req, res) => {
  const { id, password, role } = req.body as {
    id?: string;
    password?: string;
    role?: Role;
  };

  console.log("[login] attempt:", { id, role, hasPassword: !!password });

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT id, name, role, active FROM users WHERE id = ? AND password = ? AND active = 1 AND (? IS NULL OR role = ?)",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [id, password, role ?? null, role ?? null] as any[]
  );

  console.log("[login] rows found:", rows.length);

  if (rows.length === 0) {
    return res.status(401).json({ message: "Invalid credentials or account inactive" });
  }

  const user = rows[0];
  return res.json({
    token: `mock-token-${user.id}`,
    user: { id: user.id, name: user.name, role: user.role }
  });
}));

// ─── Users (Admin only) ──────────────────────────────────────────────────────

app.get("/users", ar(async (_req, res) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT id, name, role, active FROM users ORDER BY role, name"
  );
  const users: User[] = rows.map((r) => ({ ...r, active: Boolean(r.active) })) as User[];
  res.json(users);
}));

app.post("/users", ar(async (req, res) => {
  const { id, name, role, password } = req.body as { id: string; name: string; role: Role; password: string };
  await pool.execute(
    "INSERT INTO users (id, name, role, password, active) VALUES (?, ?, ?, ?, 1)",
    [id, name, role, password]
  );
  res.status(201).json({ id, name, role, active: true } satisfies User);
}));

app.patch("/users/:id/active", ar(async (req, res) => {
  const { active } = req.body as { active: boolean };
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE users SET active = ? WHERE id = ?",
    [active ? 1 : 0, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "Not found" });
  res.json({ id: req.params.id, active });
}));

app.patch("/users/:id/password", ar(async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password.trim().length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE users SET password = ? WHERE id = ?",
    [password.trim(), req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });
  res.json({ id: req.params.id, message: "Password updated." });
}));

// ─── Patients ────────────────────────────────────────────────────────────────

const PATIENT_SELECT = `
  SELECT id, mrn, name, dob, ward,
         bed, allergy_status AS allergyStatus, allergies,
         patient_status AS patientStatus,
         attending_physician_id AS attendingPhysicianId,
         admission_date AS admissionDate
  FROM patients
`;

function mapPatient(r: mysql.RowDataPacket): Patient {
  return {
    id: r.id,
    mrn: r.mrn,
    name: r.name,
    dob: r.dob instanceof Date ? r.dob.toISOString().slice(0, 10) : (r.dob ? String(r.dob) : ""),
    ward: r.ward,
    bed: r.bed ?? null,
    allergyStatus: (r.allergyStatus ?? "none") as "none" | "present",
    allergies: r.allergies ?? null,
    patientStatus: (r.patientStatus ?? "active") as "active" | "discharged" | "transferred",
    attendingPhysicianId: r.attendingPhysicianId ?? null,
    admissionDate: r.admissionDate instanceof Date
      ? r.admissionDate.toISOString().slice(0, 10)
      : (r.admissionDate ? String(r.admissionDate) : null),
  };
}

app.get("/patients", ar(async (_req, res) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`${PATIENT_SELECT} ORDER BY id`);
  res.json(rows.map(mapPatient));
}));

app.post("/patients", ar(async (req, res) => {
  const {
    mrn, name, dob, ward, bed,
    allergyStatus, allergies, patientStatus,
    attendingPhysicianId, admissionDate,
  } = req.body as Omit<Patient, "id">;
  const id = makeId("p");
  await pool.execute(
    `INSERT INTO patients
       (id, mrn, name, dob, ward, bed, allergy_status, allergies,
        patient_status, attending_physician_id, admission_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, mrn, name, dob, ward,
     bed ?? null,
     allergyStatus ?? "none",
     allergies ?? null,
     patientStatus ?? "active",
     attendingPhysicianId ?? null,
     admissionDate ?? null]
  );
  res.status(201).json({
    id, mrn, name, dob, ward,
    bed: bed ?? null,
    allergyStatus: allergyStatus ?? "none",
    allergies: allergies ?? null,
    patientStatus: patientStatus ?? "active",
    attendingPhysicianId: attendingPhysicianId ?? null,
    admissionDate: admissionDate ?? null,
  } satisfies Patient);
}));

app.put("/patients/:id", ar(async (req, res) => {
  const {
    mrn, name, dob, ward, bed,
    allergyStatus, allergies, patientStatus,
    attendingPhysicianId, admissionDate,
  } = req.body as Partial<Patient>;
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE patients SET
       mrn = COALESCE(?, mrn),
       name = COALESCE(?, name),
       dob = COALESCE(?, dob),
       ward = COALESCE(?, ward),
       bed = COALESCE(?, bed),
       allergy_status = COALESCE(?, allergy_status),
       allergies = COALESCE(?, allergies),
       patient_status = COALESCE(?, patient_status),
       attending_physician_id = COALESCE(?, attending_physician_id),
       admission_date = COALESCE(?, admission_date)
     WHERE id = ?`,
    [mrn ?? null, name ?? null, dob ?? null, ward ?? null,
     bed ?? null, allergyStatus ?? null, allergies ?? null,
     patientStatus ?? null, attendingPhysicianId ?? null,
     admissionDate ?? null, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "Not found" });

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(`${PATIENT_SELECT} WHERE id = ?`, [req.params.id]);
  res.json(mapPatient(rows[0]));
}));

app.delete("/patients/:id", ar(async (req, res) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(`${PATIENT_SELECT} WHERE id = ?`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: "Not found" });
  await pool.execute("DELETE FROM patients WHERE id = ?", [req.params.id]);
  res.json(mapPatient(rows[0]));
}));

app.get("/patients/:id", ar(async (req, res) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(`${PATIENT_SELECT} WHERE id = ?`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: "Patient not found" });
  res.json(mapPatient(rows[0]));
}));

// ─── Medications ─────────────────────────────────────────────────────────────

app.get("/medications", ar(async (_req, res) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT id, code, name, dose, route FROM medications ORDER BY id"
  );
  res.json(rows as Medication[]);
}));

app.post("/medications", ar(async (req, res) => {
  const { code, name, dose, route } = req.body as Omit<Medication, "id">;
  const id = makeId("m");
  await pool.execute(
    "INSERT INTO medications (id, code, name, dose, route) VALUES (?, ?, ?, ?, ?)",
    [id, code, name, dose, route]
  );
  res.status(201).json({ id, code, name, dose, route } satisfies Medication);
}));

app.put("/medications/:id", ar(async (req, res) => {
  const { code, name, dose, route } = req.body as Partial<Medication>;
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE medications SET code = COALESCE(?, code), name = COALESCE(?, name), dose = COALESCE(?, dose), route = COALESCE(?, route) WHERE id = ?",
    [code ?? null, name ?? null, dose ?? null, route ?? null, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "Not found" });

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT id, code, name, dose, route FROM medications WHERE id = ?", [req.params.id]
  );
  res.json(rows[0] as Medication);
}));

app.delete("/medications/:id", ar(async (req, res) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT id, code, name, dose, route FROM medications WHERE id = ?", [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ message: "Not found" });
  await pool.execute("DELETE FROM medications WHERE id = ?", [req.params.id]);
  res.json(rows[0] as Medication);
}));

// ─── Medication Orders ───────────────────────────────────────────────────────

const ORDER_SELECT = `
  SELECT id,
         patient_id       AS patientId,
         medication_id    AS medicationId,
         prescribed_dose  AS prescribedDose,
         prescribed_route AS prescribedRoute,
         scheduled_time   AS scheduledTime,
         prescription_id  AS prescriptionId,
         active,
         status
  FROM medication_orders`;

const mapOrder = (r: mysql.RowDataPacket): MedicationOrder => ({
  id: r.id,
  patientId: r.patientId,
  medicationId: r.medicationId,
  prescribedDose: r.prescribedDose,
  prescribedRoute: r.prescribedRoute,
  scheduledTime: r.scheduledTime,
  prescriptionId: r.prescriptionId,
  active: Boolean(r.active),
  status: r.status as OrderStatus
});

app.get("/orders", ar(async (_req, res) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(ORDER_SELECT + " ORDER BY id");
  res.json(rows.map(mapOrder));
}));

app.post("/orders", ar(async (req, res) => {
  const {
    patientId, medicationId, prescribedDose,
    prescribedRoute, scheduledTime, prescriptionId, active
  } = req.body as Omit<MedicationOrder, "id" | "status">;

  const [pRows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT id FROM patients WHERE id = ?", [patientId]
  );
  const [mRows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT id FROM medications WHERE id = ?", [medicationId]
  );
  if (pRows.length === 0 || mRows.length === 0) {
    return res.status(400).json({ message: "Invalid patientId or medicationId" });
  }

  const id = makeId("o");
  await pool.execute(
    "INSERT INTO medication_orders (id, patient_id, medication_id, prescribed_dose, prescribed_route, scheduled_time, prescription_id, active, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
    [id, patientId, medicationId, prescribedDose, prescribedRoute, scheduledTime, prescriptionId, active ? 1 : 0]
  );
  res.status(201).json({
    id, patientId, medicationId, prescribedDose,
    prescribedRoute, scheduledTime, prescriptionId,
    active: Boolean(active), status: "pending"
  } satisfies MedicationOrder);
}));

app.put("/orders/:id", ar(async (req, res) => {
  const {
    patientId, medicationId, prescribedDose,
    prescribedRoute, scheduledTime, prescriptionId, active
  } = req.body as Partial<MedicationOrder>;

  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE medication_orders SET
       patient_id       = COALESCE(?, patient_id),
       medication_id    = COALESCE(?, medication_id),
       prescribed_dose  = COALESCE(?, prescribed_dose),
       prescribed_route = COALESCE(?, prescribed_route),
       scheduled_time   = COALESCE(?, scheduled_time),
       prescription_id  = COALESCE(?, prescription_id),
       active           = COALESCE(?, active)
     WHERE id = ?`,
    [
      patientId ?? null, medicationId ?? null,
      prescribedDose ?? null, prescribedRoute ?? null,
      scheduledTime ?? null, prescriptionId ?? null,
      active !== undefined ? (active ? 1 : 0) : null,
      req.params.id
    ]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "Not found" });

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(ORDER_SELECT + " WHERE id = ?", [req.params.id]);
  res.json(mapOrder(rows[0]));
}));

app.patch("/orders/:id/status", ar(async (req, res) => {
  const { status } = req.body as { status: OrderStatus };
  const valid: OrderStatus[] = ["pending", "verified", "dispensed"];
  if (!valid.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE medication_orders SET status = ? WHERE id = ?",
    [status, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "Not found" });

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(ORDER_SELECT + " WHERE id = ?", [req.params.id]);
  res.json(mapOrder(rows[0]));
}));

app.delete("/orders/:id", ar(async (req, res) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(ORDER_SELECT + " WHERE id = ?", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: "Not found" });
  await pool.execute("DELETE FROM medication_orders WHERE id = ?", [req.params.id]);
  res.json(mapOrder(rows[0]));
}));

// ─── Scan Logs ───────────────────────────────────────────────────────────────

app.get("/logs", ar(async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };

  let sql = `SELECT id,
             nurse_id      AS nurseId,
             patient_id    AS patientId,
             medication_id AS medicationId,
             order_id      AS orderId,
             timestamp,
             error_types   AS errorTypes
           FROM scan_logs`;
  const params: string[] = [];

  if (from && to) {
    sql += " WHERE timestamp >= ? AND timestamp <= ?";
    params.push(from, to);
  } else if (from) {
    sql += " WHERE timestamp >= ?";
    params.push(from);
  } else if (to) {
    sql += " WHERE timestamp <= ?";
    params.push(to);
  }

  sql += " ORDER BY timestamp DESC";

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(sql, params);
  const logs: ScanLog[] = rows.map((r) => ({
    id: r.id, nurseId: r.nurseId, patientId: r.patientId,
    medicationId: r.medicationId, orderId: r.orderId ?? undefined,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
    errorTypes: typeof r.errorTypes === "string" ? JSON.parse(r.errorTypes) : (r.errorTypes ?? [])
  }));
  res.json(logs);
}));

app.post("/logs", ar(async (req, res) => {
  const body = req.body as Omit<ScanLog, "id" | "timestamp"> & { timestamp?: string };
  const id = makeId("log");
  const timestamp = toMySQL(body.timestamp ? new Date(body.timestamp) : undefined);
  const errorTypesJson = JSON.stringify(body.errorTypes ?? []);

  await pool.execute(
    "INSERT INTO scan_logs (id, nurse_id, patient_id, medication_id, order_id, timestamp, error_types) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, body.nurseId, body.patientId, body.medicationId, body.orderId ?? null, timestamp, errorTypesJson]
  );

  res.status(201).json({
    id, nurseId: body.nurseId, patientId: body.patientId,
    medicationId: body.medicationId, orderId: body.orderId,
    timestamp, errorTypes: body.errorTypes ?? []
  } satisfies ScanLog);
}));

app.patch("/logs/:id/eval", ar(async (req, res) => {
  const { adverseReaction, evalNotes } = req.body as {
    adverseReaction: boolean;
    evalNotes?: string;
  };
  const evalTime = toMySQL();
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE scan_logs SET adverse_reaction = ?, eval_notes = ?, eval_time = ? WHERE id = ?",
    [adverseReaction ? 1 : 0, evalNotes ?? null, evalTime, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "Log not found" });
  res.json({ id: req.params.id, adverseReaction, evalNotes, evalTime });
}));

// ─── Alert Thresholds ────────────────────────────────────────────────────────

app.get("/alerts/thresholds", ar(async (_req, res) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT id, metric, threshold_value AS thresholdValue, updated_at AS updatedAt FROM alert_thresholds"
  );
  res.json(rows as AlertThreshold[]);
}));

app.put("/alerts/thresholds/:id", ar(async (req, res) => {
  const { thresholdValue } = req.body as { thresholdValue: number };
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE alert_thresholds SET threshold_value = ? WHERE id = ?",
    [thresholdValue, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "Not found" });

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT id, metric, threshold_value AS thresholdValue, updated_at AS updatedAt FROM alert_thresholds WHERE id = ?",
    [req.params.id]
  );
  res.json(rows[0] as AlertThreshold);
}));

// ─── Global error handler ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "PROTOCOL_CONNECTION_LOST") {
    console.error("[db] MySQL unreachable:", err.message);
    return res.status(503).json({ message: "Database unavailable.", code });
  }
  console.error("[api] Unhandled error:", err);
  return res.status(500).json({ message: "Internal server error", detail: err.message });
});

// ─── Start ───────────────────────────────────────────────────────────────────

runMigrations()
  .then(() => {
    app.listen(port, host, () => {
      console.log(`SafeMedsQR API running on http://localhost:${port}`);
      console.log(`Database: ${process.env.DB_NAME ?? "safemedsqr"} @ ${process.env.DB_HOST ?? "localhost"}`);
    });
  })
  .catch((err) => {
    console.error("[db] migration failed, aborting startup:", err);
    process.exit(1);
  });
