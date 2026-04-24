import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import pool from "./db.js";
import { runMigrations } from "./migrate.js";
import type { AlertThreshold, Medication, MedicationOrder, OrderStatus, Patient, Role, ScanLog, User } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT ?? 4000);
const host = "0.0.0.0";

const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

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

  const { rows } = await pool.query(
    "SELECT id, name, role, active FROM users WHERE id = $1 AND password = $2 AND active = true AND ($3::text IS NULL OR role = $3::text)",
    [id, password, role ?? null]
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
  const { rows } = await pool.query(
    "SELECT id, name, role, active FROM users ORDER BY role, name"
  );
  const users: User[] = rows.map((r) => ({ ...r, active: Boolean(r.active) })) as User[];
  res.json(users);
}));

const ROLE_PREFIX: Record<string, string> = {
  nurse: "n", admin: "a", doctor: "d", pharmacist: "ph", chief_nurse: "cn"
};

app.post("/users", ar(async (req, res) => {
  const { name, role, password } = req.body as { name: string; role: Role; password: string };
  const prefix = ROLE_PREFIX[role] ?? role[0];
  const { rows } = await pool.query(
    `SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)) AS "maxNum" FROM users WHERE id ~ $1`,
    [`^${prefix}-[0-9]+$`]
  );
  const next = (rows[0].maxNum ?? 99) + 1;
  const id = `${prefix}-${next}`;
  await pool.query(
    "INSERT INTO users (id, name, role, password, active) VALUES ($1, $2, $3, $4, true)",
    [id, name, role, password]
  );
  res.status(201).json({ id, name, role, active: true } satisfies User);
}));

app.patch("/users/:id/active", ar(async (req, res) => {
  const { active } = req.body as { active: boolean };
  const result = await pool.query(
    "UPDATE users SET active = $1 WHERE id = $2",
    [active, req.params.id]
  );
  if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });
  res.json({ id: req.params.id, active });
}));

app.patch("/users/:id/password", ar(async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password.trim().length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }
  const result = await pool.query(
    "UPDATE users SET password = $1 WHERE id = $2",
    [password.trim(), req.params.id]
  );
  if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: "User not found" });
  res.json({ id: req.params.id, message: "Password updated." });
}));

// ─── Patients ────────────────────────────────────────────────────────────────

const PATIENT_SELECT = `
  SELECT id, mrn, name, dob, ward,
         bed, allergy_status AS "allergyStatus", allergies,
         patient_status AS "patientStatus",
         attending_physician_id AS "attendingPhysicianId",
         admission_date AS "admissionDate"
  FROM patients
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPatient(r: any): Patient {
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
  const { rows } = await pool.query(`${PATIENT_SELECT} ORDER BY id`);
  res.json(rows.map(mapPatient));
}));

app.get("/patients/next-mrn", ar(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(mrn FROM 4) AS INTEGER)) AS "maxNum" FROM patients WHERE mrn ~ '^MRN[0-9]+$'`
  );
  const next = (rows[0].maxNum ?? 1000) + 1;
  res.json({ mrn: `MRN${next}` });
}));

app.post("/patients", ar(async (req, res) => {
  let {
    mrn, name, dob, ward, bed,
    allergyStatus, allergies, patientStatus,
    attendingPhysicianId, admissionDate,
  } = req.body as Omit<Patient, "id"> & { mrn?: string };

  if (!mrn) {
    const { rows } = await pool.query(
      `SELECT MAX(CAST(SUBSTRING(mrn FROM 4) AS INTEGER)) AS "maxNum" FROM patients WHERE mrn ~ '^MRN[0-9]+$'`
    );
    const next = (rows[0].maxNum ?? 1000) + 1;
    mrn = `MRN${next}`;
  }

  const id = makeId("p");
  await pool.query(
    `INSERT INTO patients
       (id, mrn, name, dob, ward, bed, allergy_status, allergies,
        patient_status, attending_physician_id, admission_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
  const result = await pool.query(
    `UPDATE patients SET
       mrn = COALESCE($1, mrn),
       name = COALESCE($2, name),
       dob = COALESCE($3, dob),
       ward = COALESCE($4, ward),
       bed = COALESCE($5, bed),
       allergy_status = COALESCE($6, allergy_status),
       allergies = COALESCE($7, allergies),
       patient_status = COALESCE($8, patient_status),
       attending_physician_id = COALESCE($9, attending_physician_id),
       admission_date = COALESCE($10, admission_date)
     WHERE id = $11`,
    [mrn ?? null, name ?? null, dob ?? null, ward ?? null,
     bed ?? null, allergyStatus ?? null, allergies ?? null,
     patientStatus ?? null, attendingPhysicianId ?? null,
     admissionDate ?? null, req.params.id]
  );
  if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });

  const { rows } = await pool.query(`${PATIENT_SELECT} WHERE id = $1`, [req.params.id]);
  res.json(mapPatient(rows[0]));
}));

app.delete("/patients/:id", ar(async (req, res) => {
  const { rows } = await pool.query(`${PATIENT_SELECT} WHERE id = $1`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: "Not found" });
  await pool.query("DELETE FROM patients WHERE id = $1", [req.params.id]);
  res.json(mapPatient(rows[0]));
}));

app.get("/patients/:id", ar(async (req, res) => {
  const { rows } = await pool.query(`${PATIENT_SELECT} WHERE id = $1`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: "Patient not found" });
  res.json(mapPatient(rows[0]));
}));

// ─── Medications ─────────────────────────────────────────────────────────────

app.get("/medications", ar(async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, code, name, dose, route FROM medications ORDER BY id"
  );
  res.json(rows as Medication[]);
}));

app.post("/medications", ar(async (req, res) => {
  const { name, dose, route } = req.body as Omit<Medication, "id" | "code">;
  const { rows } = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)) AS "maxNum" FROM medications WHERE code ~ '^MED[0-9]+$'`
  );
  const next = (rows[0].maxNum ?? 1000) + 1;
  const code = `MED${next}`;
  const id = makeId("m");
  await pool.query(
    "INSERT INTO medications (id, code, name, dose, route) VALUES ($1, $2, $3, $4, $5)",
    [id, code, name, dose, route]
  );
  res.status(201).json({ id, code, name, dose, route } satisfies Medication);
}));

app.put("/medications/:id", ar(async (req, res) => {
  const { code, name, dose, route } = req.body as Partial<Medication>;
  const result = await pool.query(
    "UPDATE medications SET code = COALESCE($1, code), name = COALESCE($2, name), dose = COALESCE($3, dose), route = COALESCE($4, route) WHERE id = $5",
    [code ?? null, name ?? null, dose ?? null, route ?? null, req.params.id]
  );
  if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });

  const { rows } = await pool.query(
    "SELECT id, code, name, dose, route FROM medications WHERE id = $1", [req.params.id]
  );
  res.json(rows[0] as Medication);
}));

app.delete("/medications/:id", ar(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, code, name, dose, route FROM medications WHERE id = $1", [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ message: "Not found" });
  await pool.query("DELETE FROM medications WHERE id = $1", [req.params.id]);
  res.json(rows[0] as Medication);
}));

// ─── Medication Orders ───────────────────────────────────────────────────────

const ORDER_SELECT = `
  SELECT id,
         patient_id       AS "patientId",
         medication_id    AS "medicationId",
         prescribed_dose  AS "prescribedDose",
         prescribed_route AS "prescribedRoute",
         scheduled_time   AS "scheduledTime",
         prescription_id  AS "prescriptionId",
         active,
         status
  FROM medication_orders`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapOrder = (r: any): MedicationOrder => ({
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
  const { rows } = await pool.query(ORDER_SELECT + " ORDER BY id");
  res.json(rows.map(mapOrder));
}));

app.post("/orders", ar(async (req, res) => {
  const {
    patientId, medicationId, prescribedDose,
    prescribedRoute, scheduledTime, prescriptionId, active
  } = req.body as Omit<MedicationOrder, "id" | "status">;

  const { rows: pRows } = await pool.query(
    "SELECT id FROM patients WHERE id = $1", [patientId]
  );
  const { rows: mRows } = await pool.query(
    "SELECT id FROM medications WHERE id = $1", [medicationId]
  );
  if (pRows.length === 0 || mRows.length === 0) {
    return res.status(400).json({ message: "Invalid patientId or medicationId" });
  }

  const id = makeId("o");
  await pool.query(
    "INSERT INTO medication_orders (id, patient_id, medication_id, prescribed_dose, prescribed_route, scheduled_time, prescription_id, active, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')",
    [id, patientId, medicationId, prescribedDose, prescribedRoute, scheduledTime, prescriptionId, active ?? false]
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

  const result = await pool.query(
    `UPDATE medication_orders SET
       patient_id       = COALESCE($1, patient_id),
       medication_id    = COALESCE($2, medication_id),
       prescribed_dose  = COALESCE($3, prescribed_dose),
       prescribed_route = COALESCE($4, prescribed_route),
       scheduled_time   = COALESCE($5, scheduled_time),
       prescription_id  = COALESCE($6, prescription_id),
       active           = COALESCE($7, active)
     WHERE id = $8`,
    [
      patientId ?? null, medicationId ?? null,
      prescribedDose ?? null, prescribedRoute ?? null,
      scheduledTime ?? null, prescriptionId ?? null,
      active !== undefined ? active : null,
      req.params.id
    ]
  );
  if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });

  const { rows } = await pool.query(ORDER_SELECT + " WHERE id = $1", [req.params.id]);
  res.json(mapOrder(rows[0]));
}));

app.patch("/orders/:id/status", ar(async (req, res) => {
  const { status } = req.body as { status: OrderStatus };
  const valid: OrderStatus[] = ["pending", "verified", "dispensed"];
  if (!valid.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  const result = await pool.query(
    "UPDATE medication_orders SET status = $1 WHERE id = $2",
    [status, req.params.id]
  );
  if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });

  const { rows } = await pool.query(ORDER_SELECT + " WHERE id = $1", [req.params.id]);
  res.json(mapOrder(rows[0]));
}));

app.delete("/orders/:id", ar(async (req, res) => {
  const { rows } = await pool.query(ORDER_SELECT + " WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: "Not found" });
  await pool.query("DELETE FROM medication_orders WHERE id = $1", [req.params.id]);
  res.json(mapOrder(rows[0]));
}));

// ─── Scan Logs ───────────────────────────────────────────────────────────────

app.get("/logs", ar(async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };

  let sql = `SELECT id,
             nurse_id      AS "nurseId",
             patient_id    AS "patientId",
             medication_id AS "medicationId",
             order_id      AS "orderId",
             timestamp,
             error_types   AS "errorTypes"
           FROM scan_logs`;
  const params: string[] = [];

  if (from && to) {
    sql += " WHERE timestamp >= $1 AND timestamp <= $2";
    params.push(from, to);
  } else if (from) {
    sql += " WHERE timestamp >= $1";
    params.push(from);
  } else if (to) {
    sql += " WHERE timestamp <= $1";
    params.push(to);
  }

  sql += " ORDER BY timestamp DESC";

  const { rows } = await pool.query(sql, params);
  const logs: ScanLog[] = rows.map((r) => ({
    id: r.id, nurseId: r.nurseId, patientId: r.patientId,
    medicationId: r.medicationId, orderId: r.orderId ?? undefined,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
    errorTypes: Array.isArray(r.errorTypes) ? r.errorTypes : (typeof r.errorTypes === "string" ? JSON.parse(r.errorTypes) : [])
  }));
  res.json(logs);
}));

app.post("/logs", ar(async (req, res) => {
  const body = req.body as Omit<ScanLog, "id" | "timestamp"> & { timestamp?: string };
  const id = makeId("log");
  const timestamp = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();
  const errorTypes = body.errorTypes ?? [];

  await pool.query(
    "INSERT INTO scan_logs (id, nurse_id, patient_id, medication_id, order_id, timestamp, error_types) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, body.nurseId, body.patientId, body.medicationId, body.orderId ?? null, timestamp, JSON.stringify(errorTypes)]
  );

  res.status(201).json({
    id, nurseId: body.nurseId, patientId: body.patientId,
    medicationId: body.medicationId, orderId: body.orderId,
    timestamp, errorTypes
  } satisfies ScanLog);
}));

app.patch("/logs/:id/eval", ar(async (req, res) => {
  const { adverseReaction, evalNotes } = req.body as {
    adverseReaction: boolean;
    evalNotes?: string;
  };
  const evalTime = new Date().toISOString();
  const result = await pool.query(
    "UPDATE scan_logs SET adverse_reaction = $1, eval_notes = $2, eval_time = $3 WHERE id = $4",
    [adverseReaction, evalNotes ?? null, evalTime, req.params.id]
  );
  if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: "Log not found" });
  res.json({ id: req.params.id, adverseReaction, evalNotes, evalTime });
}));

// ─── Alert Thresholds ────────────────────────────────────────────────────────

app.get("/alerts/thresholds", ar(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, metric, threshold_value AS "thresholdValue", updated_at AS "updatedAt" FROM alert_thresholds`
  );
  res.json(rows as AlertThreshold[]);
}));

app.put("/alerts/thresholds/:id", ar(async (req, res) => {
  const { thresholdValue } = req.body as { thresholdValue: number };
  const result = await pool.query(
    "UPDATE alert_thresholds SET threshold_value = $1 WHERE id = $2",
    [thresholdValue, req.params.id]
  );
  if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });

  const { rows } = await pool.query(
    `SELECT id, metric, threshold_value AS "thresholdValue", updated_at AS "updatedAt" FROM alert_thresholds WHERE id = $1`,
    [req.params.id]
  );
  res.json(rows[0] as AlertThreshold);
}));

// ─── Global error handler ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    console.error("[db] PostgreSQL unreachable:", err.message);
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
      const dbUrl = process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@") ?? "unset";
      console.log(`Database: ${dbUrl}`);
    });
  })
  .catch((err) => {
    console.error("[db] migration failed, aborting startup:", err);
    process.exit(1);
  });
