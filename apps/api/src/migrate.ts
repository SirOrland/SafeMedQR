import pool from "./db.js";

export async function runMigrations() {
  const columnExists = async (table: string, column: string) => {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      [table, column]
    );
    return Number(rows[0].cnt) > 0;
  };

  // users.active
  if (!(await columnExists("users", "active"))) {
    await pool.query("ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT true");
    await pool.query("UPDATE users SET active = true");
  }

  // scan_logs eval columns
  const evalCols: [string, string][] = [
    ["adverse_reaction", "BOOLEAN NULL"],
    ["eval_notes",       "TEXT NULL"],
    ["eval_time",        "TIMESTAMP NULL"],
  ];
  for (const [col, def] of evalCols) {
    if (!(await columnExists("scan_logs", col))) {
      await pool.query(`ALTER TABLE scan_logs ADD COLUMN ${col} ${def}`);
    }
  }

  // medication_orders.status
  if (!(await columnExists("medication_orders", "status"))) {
    await pool.query(
      `ALTER TABLE medication_orders ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'`
    );
  }

  // patients new columns
  const patientCols: [string, string][] = [
    ["allergies",              "TEXT NULL"],
    ["bed",                    "VARCHAR(100) NULL"],
    ["allergy_status",         "VARCHAR(20) NOT NULL DEFAULT 'none'"],
    ["patient_status",         "VARCHAR(20) NOT NULL DEFAULT 'active'"],
    ["attending_physician_id", "VARCHAR(50) NULL"],
    ["admission_date",         "DATE NULL"],
  ];
  for (const [col, def] of patientCols) {
    if (!(await columnExists("patients", col))) {
      await pool.query(`ALTER TABLE patients ADD COLUMN ${col} ${def}`);
    }
  }

  // Expand scheduled_time to VARCHAR(20) if needed
  const { rows: stRows } = await pool.query(
    `SELECT character_maximum_length AS len FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'medication_orders' AND column_name = 'scheduled_time'`
  );
  if (stRows[0]?.len !== null && Number(stRows[0]?.len) < 20) {
    await pool.query(
      "ALTER TABLE medication_orders ALTER COLUMN scheduled_time TYPE VARCHAR(20)"
    );
  }

  // Rename supervisor -> chief_nurse (idempotent)
  await pool.query("UPDATE users SET role = 'chief_nurse' WHERE role = 'supervisor'");

  // Ensure alert_thresholds table exists (may be missing from older schemas)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_thresholds (
      id              VARCHAR(50)       NOT NULL PRIMARY KEY,
      metric          VARCHAR(255)      NOT NULL,
      threshold_value DOUBLE PRECISION  NOT NULL,
      updated_at      TIMESTAMP         NOT NULL DEFAULT NOW()
    )
  `);

  console.log("[db] migrations applied");
}
