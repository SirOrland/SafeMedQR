import pool from "./db.js";

export async function runMigrations() {
  const [rows] = await pool.execute<import("mysql2").RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'active'`
  );
  if (Number(rows[0].cnt) === 0) {
    await pool.execute(
      `ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1`
    );
    await pool.execute(`UPDATE users SET active = 1`);
  }

  // Add eval columns to scan_logs if missing
  const evalCols = ["adverse_reaction", "eval_notes", "eval_time"] as const;
  const colDefs: Record<typeof evalCols[number], string> = {
    adverse_reaction: "TINYINT(1) NULL",
    eval_notes:       "TEXT NULL",
    eval_time:        "DATETIME NULL",
  };
  for (const col of evalCols) {
    const [colRows] = await pool.execute<import("mysql2").RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scan_logs' AND COLUMN_NAME = ?`,
      [col]
    );
    if (Number(colRows[0].cnt) === 0) {
      await pool.execute(`ALTER TABLE scan_logs ADD COLUMN ${col} ${colDefs[col]}`);
    }
  }

  // Add status column to medication_orders if missing
  const [statusRows] = await pool.execute<import("mysql2").RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medication_orders' AND COLUMN_NAME = 'status'`
  );
  if (Number(statusRows[0].cnt) === 0) {
    await pool.execute(
      `ALTER TABLE medication_orders ADD COLUMN status ENUM('pending','verified','dispensed') NOT NULL DEFAULT 'pending'`
    );
  }

  // Add new patient safety/clinical columns if missing
  type PatientCol = "allergies" | "bed" | "allergy_status" | "patient_status" | "attending_physician_id" | "admission_date";
  const patientColDefs: Record<PatientCol, string> = {
    allergies:              "TEXT NULL",
    bed:                    "VARCHAR(100) NULL",
    allergy_status:         "ENUM('none','present') NOT NULL DEFAULT 'none'",
    patient_status:         "ENUM('active','discharged','transferred') NOT NULL DEFAULT 'active'",
    attending_physician_id: "VARCHAR(50) NULL",
    admission_date:         "DATE NULL",
  };
  for (const [col, def] of Object.entries(patientColDefs) as [PatientCol, string][]) {
    const [colRows] = await pool.execute<import("mysql2").RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND COLUMN_NAME = ?`,
      [col]
    );
    if (Number(colRows[0].cnt) === 0) {
      await pool.execute(`ALTER TABLE patients ADD COLUMN ${col} ${def}`);
    }
  }

  console.log("[db] migrations applied");
}
