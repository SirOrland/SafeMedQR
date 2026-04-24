<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import {
    changeUserPassword,
    createMedication, createOrder, createPatient, createUser,
    deleteMedication, deleteOrder, deletePatient,
    getLogs, getMedications, getNextMrn, getOrders, getPatients,
    getThresholds, getUsers, setUserActive, updateThreshold
  } from "$lib/api";
  import { clearSession, session } from "$lib/session";
  import type { AlertThreshold, Medication, MedicationOrder, Patient, Role, ScanLog, User } from "$lib/types";
  import QRCode from "qrcode";

  let userName = "";
  let activeTab: "users" | "patients" | "medications" | "orders" | "logs" | "alerts" = "users";

  let users: User[] = [];
  let patients: Patient[] = [];
  let medications: Medication[] = [];
  let orders: MedicationOrder[] = [];
  let logs: ScanLog[] = [];
  let thresholds: AlertThreshold[] = [];
  let fromDate = "";
  let toDate = "";

  let userForm = { id: "", name: "", role: "nurse" as Role, password: "" };
  let nextMrn = "";
  let patientForm = {
    name: "", dob: "", ward: "", bed: "",
    allergyStatus: "none" as "none" | "present",
    allergies: "",
    patientStatus: "active" as "active" | "discharged" | "transferred",
    attendingPhysicianId: "", admissionDate: "",
  };
  let medForm = { code: "", name: "", dose: "", route: "" };
  let orderForm = { patientId: "", medicationId: "", prescribedDose: "", prescribedRoute: "", scheduledTime: "", prescriptionId: "", active: true };

  let qrOpen = false; let qrTitle = ""; let qrUrl = ""; let qrSub = "";
  let pwOpen = false; let pwUserId = ""; let pwUserName = ""; let pwValue = ""; let pwError = ""; let pwLoading = false;
  let editThresholds: Record<string, number> = {};

  onMount(async () => {
    const s = $session;
    if (!s || s.user.role !== "admin") { await goto("/"); return; }
    userName = s.user.name;
    await loadAll();
  });

  async function loadAll() {
    [users, patients, medications, orders, logs, thresholds] = await Promise.all([
      getUsers(), getPatients(), getMedications(), getOrders(),
      getLogs(fromDate || undefined, toDate || undefined), getThresholds()
    ]);
    editThresholds = Object.fromEntries(thresholds.map(t => [t.id, t.thresholdValue]));
    nextMrn = (await getNextMrn()).mrn;
  }

  async function openQr(id: string, title: string, sub: string) {
    qrTitle = title; qrSub = sub;
    qrUrl = await QRCode.toDataURL(id, { width: 280, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } });
    qrOpen = true;
  }
  function printQr() {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>QR – ${qrTitle}</title><style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Inter,sans-serif}img{width:240px;height:240px}h2{margin:16px 0 4px;font-size:20px}p{margin:0;color:#64748b;font-size:14px}</style></head><body><img src="${qrUrl}"/><h2>${qrTitle}</h2><p>${qrSub}</p><script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
    w.document.close();
  }

  function openPw(u: User) { pwUserId = u.id; pwUserName = u.name; pwValue = ""; pwError = ""; pwOpen = true; }
  async function savePw() {
    if (pwValue.trim().length < 6) { pwError = "Password must be at least 6 characters."; return; }
    pwLoading = true; pwError = "";
    try { await changeUserPassword(pwUserId, pwValue); pwOpen = false; }
    catch (e: unknown) { pwError = e instanceof Error ? e.message : "Failed to update password."; }
    finally { pwLoading = false; }
  }

  async function addUser() { await createUser(userForm); userForm = { id: "", name: "", role: "nurse", password: "" }; await loadAll(); }
  async function toggleActive(u: User) { await setUserActive(u.id, !u.active); await loadAll(); }
  async function addPatient() {
    await createPatient(patientForm);
    patientForm = { name: "", dob: "", ward: "", bed: "", allergyStatus: "none", allergies: "", patientStatus: "active", attendingPhysicianId: "", admissionDate: "" };
    await loadAll();
  }
  async function addMed() { await createMedication(medForm); medForm = { code: "", name: "", dose: "", route: "" }; await loadAll(); }
  async function addOrder() { await createOrder(orderForm); orderForm = { patientId: "", medicationId: "", prescribedDose: "", prescribedRoute: "", scheduledTime: "", prescriptionId: "", active: true }; await loadAll(); }
  async function saveThreshold(t: AlertThreshold) { await updateThreshold(t.id, editThresholds[t.id]); await loadAll(); }

  function signOut() { clearSession(); goto("/"); }
  function setTab(key: string) { activeTab = key as typeof activeTab; }

  $: totalScans = logs.length;
  $: errorScans = logs.filter(l => l.errorTypes.length > 0).length;
  $: errorRate = totalScans > 0 ? Math.round((errorScans / totalScans) * 100) : 0;

  const TAB_LABELS: Record<"users"|"patients"|"medications"|"orders"|"logs"|"alerts", string> = {
    users: "User Accounts", patients: "Patients", medications: "Medications",
    orders: "Medication Orders", logs: "Audit Logs", alerts: "Alert Config",
  };
</script>

<svelte:head><title>Admin Dashboard — SafeMedsQR</title></svelte:head>

<!-- Password modal -->
{#if pwOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click|self={() => pwOpen = false}>
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div><p class="modal-eyebrow">Change Password</p><h2 class="modal-title">{pwUserName}</h2><p class="modal-sub">Set a new password for this account.</p></div>
        <button class="close-btn" on:click={() => pwOpen = false}>✕</button>
      </div>
      <label class="field">
        <span>New Password</span>
        <input type="password" placeholder="Minimum 6 characters" bind:value={pwValue} on:keydown={(e) => e.key === 'Enter' && savePw()} />
      </label>
      {#if pwError}<p class="inline-error">{pwError}</p>{/if}
      <div class="modal-actions">
        <button class="btn btn-ghost" on:click={() => pwOpen = false}>Cancel</button>
        <button class="btn btn-primary" on:click={savePw} disabled={pwLoading}>{pwLoading ? 'Saving…' : 'Save Password'}</button>
      </div>
    </div>
  </div>
{/if}

<!-- QR modal -->
{#if qrOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click|self={() => qrOpen = false}>
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><p class="modal-eyebrow">QR Code</p><h2 class="modal-title">{qrTitle}</h2><p class="modal-sub">{qrSub}</p></div><button class="close-btn" on:click={() => qrOpen = false}>✕</button></div>
      <div class="qr-box"><img src={qrUrl} alt="QR" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" on:click={() => qrOpen = false}>Close</button><button class="btn btn-primary" on:click={printQr}>Print QR</button></div>
    </div>
  </div>
{/if}

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">✚</div>
      <div>
        <p class="brand-app">SafeMedsQR</p>
        <p class="brand-role">Admin</p>
      </div>
    </div>

    <nav>
      {#each Object.entries(TAB_LABELS) as [key, label]}
        <button class="nav-item" class:active={activeTab === key} on:click={() => setTab(key)}>
          {label}
        </button>
      {/each}
    </nav>

    <div class="sidebar-footer">
      <div class="user-row">
        <div class="user-avatar">{userName[0] ?? "A"}</div>
        <span class="user-name">{userName}</span>
      </div>
      <button class="btn-signout" on:click={signOut}>Sign out</button>
    </div>
  </aside>

  <div class="main-wrap">
    <!-- Page header -->
    <header class="page-header">
      <div>
        <p class="page-eyebrow">Admin Dashboard</p>
        <h1 class="page-title">{TAB_LABELS[activeTab]}</h1>
      </div>
      <div class="header-stats">
        <div class="hstat"><span class="hstat-val">{users.length}</span><span class="hstat-label">Users</span></div>
        <div class="hstat"><span class="hstat-val">{patients.length}</span><span class="hstat-label">Patients</span></div>
        <div class="hstat hstat-warn"><span class="hstat-val">{errorRate}%</span><span class="hstat-label">Error Rate</span></div>
        <div class="hstat"><span class="hstat-val">{totalScans}</span><span class="hstat-label">Total Scans</span></div>
      </div>
    </header>

    <main class="content">

      <!-- ── USERS ── -->
      {#if activeTab === "users"}
        <div class="panel">
          <div class="panel-head">
            <div><h2>User Accounts</h2><p>Create and manage staff access. Only active accounts can log in.</p></div>
          </div>
          <div class="form-grid">
            <label class="field"><span>Staff ID</span><input placeholder="e.g. n-102" bind:value={userForm.id}/></label>
            <label class="field"><span>Full Name</span><input placeholder="Full name" bind:value={userForm.name}/></label>
            <label class="field"><span>Role</span>
              <select bind:value={userForm.role}>
                <option value="admin">Admin</option>
                <option value="doctor">Doctor</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="supervisor">Supervisor</option>
                <option value="nurse">Nurse</option>
              </select>
            </label>
            <label class="field"><span>Password</span><input type="password" placeholder="Temporary password" bind:value={userForm.password}/></label>
            <button class="btn btn-primary align-end" on:click={addUser}>Create Account</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {#each users as u}
                  <tr>
                    <td class="mono">{u.id}</td>
                    <td class="fw-600">{u.name}</td>
                    <td><span class="role-badge role-{u.role}">{u.role}</span></td>
                    <td><span class="status-badge" class:active={u.active} class:inactive={!u.active}>{u.active ? "Active" : "Inactive"}</span></td>
                    <td class="actions-cell">
                      <button class="btn btn-sm" class:btn-danger={u.active} class:btn-success={!u.active} on:click={() => toggleActive(u)}>{u.active ? "Deactivate" : "Activate"}</button>
                      <button class="btn btn-sm btn-ghost" on:click={() => openPw(u)}>Change Password</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ── PATIENTS ── -->
      {:else if activeTab === "patients"}
        <div class="panel">
          <div class="panel-head"><div><h2>Patients</h2><p>Register patient records for use in medication verification workflows.</p></div></div>
          <div class="form-grid">
            <label class="field"><span>MRN</span><input readonly value={nextMrn} class="mrn-preview"/></label>
            <label class="field"><span>Full Name</span><input placeholder="Patient full name" bind:value={patientForm.name}/></label>
            <label class="field"><span>Date of Birth</span><input type="date" bind:value={patientForm.dob}/></label>
            <label class="field"><span>Ward</span><input placeholder="Ward / Unit" bind:value={patientForm.ward}/></label>
            <label class="field"><span>Bed</span><input placeholder="Bed / Room" bind:value={patientForm.bed}/></label>
            <label class="field"><span>Allergy Status</span>
              <select bind:value={patientForm.allergyStatus}>
                <option value="none">None</option>
                <option value="present">Present</option>
              </select>
            </label>
            {#if patientForm.allergyStatus === "present"}
              <label class="field"><span>Known Allergies</span><input placeholder="List drug allergies" bind:value={patientForm.allergies}/></label>
            {/if}
            <label class="field"><span>Patient Status</span>
              <select bind:value={patientForm.patientStatus}>
                <option value="active">Active</option>
                <option value="discharged">Discharged</option>
                <option value="transferred">Transferred</option>
              </select>
            </label>
            <label class="field"><span>Attending Physician</span>
              <select bind:value={patientForm.attendingPhysicianId}>
                <option value="">— None —</option>
                {#each users.filter(u => u.role === "doctor") as doc}
                  <option value={doc.id}>{doc.name} ({doc.id})</option>
                {/each}
              </select>
            </label>
            <label class="field"><span>Admission Date</span><input type="date" bind:value={patientForm.admissionDate}/></label>
            <button class="btn btn-primary align-end" on:click={addPatient}>Add Patient</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>MRN</th><th>Name</th><th>DOB</th><th>Ward / Bed</th><th>Allergy</th><th>Status</th><th>QR</th><th>Action</th></tr></thead>
              <tbody>
                {#each patients as p}
                  <tr>
                    <td class="mono">{p.id}</td>
                    <td class="mono">{p.mrn}</td>
                    <td class="fw-600">{p.name}</td>
                    <td>{p.dob}</td>
                    <td>{p.ward}{p.bed ? ` / ${p.bed}` : ""}</td>
                    <td>
                      {#if p.allergyStatus === "present"}
                        <span class="badge badge-danger" title={p.allergies ?? ""}>⚠ Allergy</span>
                      {:else}
                        <span class="badge badge-ok">None</span>
                      {/if}
                    </td>
                    <td><span class="patient-status {p.patientStatus}">{p.patientStatus}</span></td>
                    <td><button class="btn btn-sm btn-outline-blue" on:click={() => openQr(p.id, p.name, `MRN: ${p.mrn} · ${p.ward}`)}>Print QR</button></td>
                    <td><button class="btn btn-sm btn-danger" on:click={() => deletePatient(p.id).then(loadAll)}>Delete</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ── MEDICATIONS ── -->
      {:else if activeTab === "medications"}
        <div class="panel">
          <div class="panel-head"><div><h2>Medications</h2><p>Maintain medication master data used during scan verification.</p></div></div>
          <div class="form-grid">
            <label class="field"><span>Code</span><input placeholder="Medication code" bind:value={medForm.code}/></label>
            <label class="field"><span>Name</span><input placeholder="Medication name" bind:value={medForm.name}/></label>
            <label class="field"><span>Dose</span><input placeholder="e.g. 500mg" bind:value={medForm.dose}/></label>
            <label class="field"><span>Route</span><input placeholder="PO, IV, IM…" bind:value={medForm.route}/></label>
            <button class="btn btn-primary align-end" on:click={addMed}>Add Medication</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Code</th><th>Name</th><th>Dose</th><th>Route</th><th>Action</th></tr></thead>
              <tbody>
                {#each medications as m}
                  <tr>
                    <td class="mono">{m.id}</td><td class="mono">{m.code}</td><td class="fw-600">{m.name}</td><td>{m.dose}</td><td>{m.route}</td>
                    <td><button class="btn btn-sm btn-danger" on:click={() => deleteMedication(m.id).then(loadAll)}>Delete</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ── ORDERS ── -->
      {:else if activeTab === "orders"}
        <div class="panel">
          <div class="panel-head"><div><h2>Medication Orders</h2><p>Create and manage active medication orders.</p></div></div>
          <div class="form-grid order-grid">
            <label class="field">
              <span>Patient ID</span>
              <select bind:value={orderForm.patientId}>
                <option value="">— Select Patient —</option>
                {#each patients as p}
                  <option value={p.id}>{p.name} ({p.id})</option>
                {/each}
              </select>
            </label>
            <label class="field">
              <span>Medication ID</span>
              <select bind:value={orderForm.medicationId}>
                <option value="">— Select Medication —</option>
                {#each medications as m}
                  <option value={m.id}>{m.name} — {m.dose} ({m.id})</option>
                {/each}
              </select>
            </label>
            <label class="field"><span>Dose</span><input placeholder="Prescribed dose" bind:value={orderForm.prescribedDose}/></label>
            <label class="field"><span>Route</span><input placeholder="Route" bind:value={orderForm.prescribedRoute}/></label>
            <label class="field"><span>Scheduled Time</span><input type="time" bind:value={orderForm.scheduledTime}/></label>
            <label class="field"><span>Rx ID</span><input placeholder="Prescription ID" bind:value={orderForm.prescriptionId}/></label>
            <button class="btn btn-primary align-end" on:click={addOrder}>Add Order</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Patient</th><th>Medication</th><th>Dose</th><th>Route</th><th>Time</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {#each orders as o}
                  <tr>
                    <td class="mono">{o.id}</td><td>{o.patientId}</td><td>{o.medicationId}</td>
                    <td>{o.prescribedDose}</td><td>{o.prescribedRoute}</td><td>{o.scheduledTime}</td>
                    <td><span class="order-status {o.status}">{o.status}</span></td>
                    <td><button class="btn btn-sm btn-danger" on:click={() => deleteOrder(o.id).then(loadAll)}>Delete</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ── AUDIT LOGS ── -->
      {:else if activeTab === "logs"}
        <div class="panel">
          <div class="panel-head">
            <div><h2>Audit Logs</h2><p>Review all medication scan events and safety exceptions.</p></div>
          </div>
          <div class="filters-bar">
            <label class="field"><span>From</span><input type="date" bind:value={fromDate}/></label>
            <label class="field"><span>To</span><input type="date" bind:value={toDate}/></label>
            <button class="btn btn-secondary align-end" on:click={loadAll}>Apply Filter</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Timestamp</th><th>Nurse ID</th><th>Patient ID</th><th>Medication ID</th><th>Errors</th></tr></thead>
              <tbody>
                {#each logs as l}
                  <tr>
                    <td class="ts">{new Date(l.timestamp).toLocaleString()}</td>
                    <td class="mono">{l.nurseId}</td>
                    <td class="mono">{l.patientId}</td>
                    <td class="mono">{l.medicationId}</td>
                    <td class:has-error={l.errorTypes.length > 0}>{l.errorTypes.length ? l.errorTypes.join(", ") : "—"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ── ALERT CONFIG ── -->
      {:else if activeTab === "alerts"}
        <div class="panel">
          <div class="panel-head"><div><h2>Alert Thresholds</h2><p>Configure when escalation alerts are triggered for the supervisor dashboard.</p></div></div>
          <div class="thresholds-grid">
            {#each thresholds as t}
              <div class="threshold-card">
                <p class="t-metric">{t.metric.replace(/_/g, " ")}</p>
                <div class="t-row">
                  <input type="number" bind:value={editThresholds[t.id]} class="t-input"/>
                  <button class="btn btn-primary btn-sm" on:click={() => saveThreshold(t)}>Save</button>
                </div>
                <p class="t-updated">Updated: {new Date(t.updatedAt).toLocaleString()}</p>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    </main>
  </div>
</div>

<style>
  :global(*){box-sizing:border-box;margin:0}
  :global(body){font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;background:#f1f5f9;min-height:100vh}

  /* ── Shell ── */
  .shell { display:flex; min-height:100vh; }

  /* ── Sidebar ── */
  .sidebar {
    width: 240px; flex-shrink: 0;
    background: #0f172a;
    display: flex; flex-direction: column;
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
  }
  .brand {
    display: flex; align-items: center; gap: 12px;
    padding: 24px 20px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .brand-logo {
    width: 36px; height: 36px; border-radius: 10px;
    background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.3);
    display: grid; place-items: center;
    font-size: 16px; color: #93c5fd; flex-shrink: 0;
  }
  .brand-app { font-size: 13px; font-weight: 800; color: #fff; letter-spacing: 0.02em; }
  .brand-role { font-size: 11px; color: #3b82f6; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 1px; }

  nav { padding: 12px 10px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .nav-item {
    display: block; width: 100%; text-align: left;
    padding: 9px 12px; border-radius: 8px;
    background: none; border: none;
    color: #94a3b8; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: background 0.12s, color 0.12s;
  }
  .nav-item:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
  .nav-item.active { background: rgba(59,130,246,0.15); color: #93c5fd; }

  .sidebar-footer {
    padding: 16px 20px;
    border-top: 1px solid rgba(255,255,255,0.06);
    display: flex; flex-direction: column; gap: 10px;
  }
  .user-row { display: flex; align-items: center; gap: 10px; }
  .user-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.3);
    display: grid; place-items: center;
    font-size: 13px; font-weight: 800; color: #93c5fd; text-transform: uppercase;
    flex-shrink: 0;
  }
  .user-name { font-size: 13px; font-weight: 600; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-signout {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; color: #94a3b8; font-size: 12px; font-weight: 600;
    padding: 7px 12px; cursor: pointer; transition: background 0.12s;
    text-align: left; width: 100%;
  }
  .btn-signout:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }

  /* ── Main ── */
  .main-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }

  /* ── Page header ── */
  .page-header {
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    padding: 20px 28px;
    display: flex; justify-content: space-between; align-items: center; gap: 24px;
    flex-wrap: wrap;
  }
  .page-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #3b82f6; margin-bottom: 4px; }
  .page-title { font-size: 22px; font-weight: 800; color: #0f172a; }
  .header-stats { display: flex; gap: 24px; }
  .hstat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .hstat-val { font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1; }
  .hstat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
  .hstat-warn .hstat-val { color: #dc2626; }

  /* ── Content ── */
  .content { padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; }

  /* ── Panel ── */
  .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 1px 4px rgba(15,23,42,0.05); }
  .panel-head { margin-bottom: 20px; }
  .panel-head h2 { font-size: 17px; font-weight: 800; color: #0f172a; }
  .panel-head p { font-size: 13px; color: #64748b; margin-top: 4px; line-height: 1.5; }

  /* ── Forms ── */
  .form-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 20px; }
  .order-grid { grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); }
  .filters-bar { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 20px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field span { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; }
  input, select {
    border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 9px 12px;
    font-size: 14px; color: #0f172a; background: #fff; width: 100%;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input:focus, select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
  input::placeholder { color: #94a3b8; }
  .mrn-preview { background: #f8fafc; color: #475569; font-family: "SF Mono","Fira Code",monospace; font-weight: 700; cursor: default; }
  .align-end { align-self: end; }

  /* ── Table ── */
  .table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; min-width: 600px; background: #fff; }
  thead tr { background: #f8fafc; }
  th { padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; border-bottom: 1px solid #e2e8f0; text-align: left; white-space: nowrap; }
  td { padding: 11px 14px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #374151; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: #f8fafc; }
  td.mono { font-family: "SF Mono", "Fira Code", monospace; font-size: 12px; color: #475569; }
  td.fw-600 { font-weight: 600; color: #0f172a; }
  td.ts { color: #64748b; font-size: 12px; white-space: nowrap; }
  td.has-error { color: #dc2626; font-weight: 600; }
  .actions-cell { display: flex; gap: 6px; flex-wrap: wrap; }

  /* ── Badges ── */
  .role-badge { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 3px 8px; border: 1px solid; }
  .role-badge.role-admin      { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
  .role-badge.role-doctor     { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
  .role-badge.role-pharmacist { background: #fdf4ff; color: #7e22ce; border-color: #e9d5ff; }
  .role-badge.role-supervisor { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
  .role-badge.role-nurse      { background: #f0f9ff; color: #0369a1; border-color: #bae6fd; }

  .status-badge { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 3px 8px; border: 1px solid; }
  .status-badge.active   { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
  .status-badge.inactive { background: #f8fafc; color: #94a3b8; border-color: #e2e8f0; }

  .order-status { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 3px 8px; border: 1px solid; }
  .order-status.pending   { background: #fffbeb; color: #92400e; border-color: #fde68a; }
  .order-status.verified  { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
  .order-status.dispensed { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }

  .badge { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 3px 8px; border: 1px solid; }
  .badge-danger { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
  .badge-ok     { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }

  .patient-status { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 3px 8px; border: 1px solid; }
  .patient-status.active      { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
  .patient-status.discharged  { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
  .patient-status.transferred { background: #fffbeb; color: #92400e; border-color: #fde68a; }

  /* ── Buttons ── */
  .btn { border: none; border-radius: 8px; font-weight: 700; font-size: 13px; padding: 8px 14px; cursor: pointer; transition: filter 0.12s, transform 0.06s; }
  .btn:hover { filter: brightness(1.05); }
  .btn:active { transform: translateY(1px); }
  .btn-primary { background: #1d4ed8; color: #fff; }
  .btn-secondary { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; }
  .btn-ghost { background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }
  .btn-danger { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .btn-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  .btn-outline-blue { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .btn-sm { padding: 6px 10px; font-size: 12px; }

  /* ── Thresholds ── */
  .thresholds-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .threshold-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .t-metric { font-size: 14px; font-weight: 700; text-transform: capitalize; color: #0f172a; }
  .t-row { display: flex; gap: 8px; align-items: center; }
  .t-input { width: 100px !important; text-align: center; font-weight: 700; }
  .t-updated { font-size: 11px; color: #94a3b8; }

  /* ── Modal ── */
  .backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.55); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 24px; z-index: 200; }
  .modal { background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px; width: min(440px,100%); display: flex; flex-direction: column; gap: 18px; box-shadow: 0 20px 60px rgba(15,23,42,0.2); }
  .modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .modal-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #3b82f6; margin-bottom: 4px; }
  .modal-title { font-size: 20px; font-weight: 800; color: #0f172a; }
  .modal-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
  .close-btn { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 13px; color: #475569; display: grid; place-items: center; flex-shrink: 0; }
  .close-btn:hover { background: #e2e8f0; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .qr-box { display: flex; justify-content: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
  .qr-box img { width: 220px; height: 220px; border-radius: 8px; }
  .inline-error { font-size: 13px; color: #dc2626; font-weight: 600; }
</style>
