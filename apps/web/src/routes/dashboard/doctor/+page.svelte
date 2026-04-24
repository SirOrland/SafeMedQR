<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { createOrder, getMedications, getOrders, getPatients } from "$lib/api";
  import { clearSession, session } from "$lib/session";
  import type { Medication, MedicationOrder, Patient } from "$lib/types";

  let userName = "";
  let activeTab: "create" | "orders" | "patients" = "create";

  let patients: Patient[] = [];
  let medications: Medication[] = [];
  let orders: MedicationOrder[] = [];

  let orderForm = {
    patientId: "", medicationId: "", prescribedDose: "",
    prescribedRoute: "", scheduledTime: "", prescriptionId: "", active: true
  };
  let formError = "";
  let formSuccess = "";

  onMount(async () => {
    const s = $session;
    if (!s || s.user.role !== "doctor") { await goto("/"); return; }
    userName = s.user.name;
    await loadAll();
  });

  async function loadAll() {
    [patients, medications, orders] = await Promise.all([getPatients(), getMedications(), getOrders()]);
  }

  async function submitOrder() {
    formError = ""; formSuccess = "";
    if (!orderForm.patientId || !orderForm.medicationId || !orderForm.prescribedDose || !orderForm.scheduledTime) {
      formError = "Please fill in all required fields."; return;
    }
    try {
      await createOrder({ ...orderForm });
      formSuccess = "Order created successfully.";
      orderForm = { patientId: "", medicationId: "", prescribedDose: "", prescribedRoute: "", scheduledTime: "", prescriptionId: "", active: true };
      await loadAll();
    } catch (e: unknown) {
      formError = e instanceof Error ? e.message : "Failed to create order";
    }
  }

  function patientName(id: string) { return patients.find(p => p.id === id)?.name ?? id; }
  function medName(id: string)     { return medications.find(m => m.id === id)?.name ?? id; }

  $: myOrders      = orders;
  $: pendingCount  = orders.filter(o => o.status === "pending").length;
  $: verifiedCount = orders.filter(o => o.status === "verified").length;
  $: dispensedCount = orders.filter(o => o.status === "dispensed").length;
</script>

<svelte:head><title>Doctor Dashboard — SafeMedsQR</title></svelte:head>

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">✚</div>
      <div>
        <p class="brand-app">SafeMedsQR</p>
        <p class="brand-role">Doctor</p>
      </div>
    </div>
    <nav>
      <button class="nav-item" class:active={activeTab==="create"}   on:click={() => activeTab="create"}>New Order</button>
      <button class="nav-item" class:active={activeTab==="orders"}   on:click={() => activeTab="orders"}>Order Status</button>
      <button class="nav-item" class:active={activeTab==="patients"} on:click={() => activeTab="patients"}>Patients</button>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="user-avatar">{userName[0] ?? "D"}</div>
        <span class="user-name">{userName}</span>
      </div>
      <button class="btn-signout" on:click={() => { clearSession(); goto("/"); }}>Sign out</button>
    </div>
  </aside>

  <div class="main-wrap">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">Doctor Dashboard</p>
        <h1 class="page-title">
          {activeTab === "create" ? "New Order" : activeTab === "orders" ? "Order Status" : "Patients"}
        </h1>
      </div>
      <div class="header-stats">
        <div class="hstat"><span class="hstat-val">{pendingCount}</span><span class="hstat-label">Pending</span></div>
        <div class="hstat hstat-blue"><span class="hstat-val">{verifiedCount}</span><span class="hstat-label">Verified</span></div>
        <div class="hstat hstat-green"><span class="hstat-val">{dispensedCount}</span><span class="hstat-label">Dispensed</span></div>
        <div class="hstat"><span class="hstat-val">{orders.length}</span><span class="hstat-label">Total</span></div>
      </div>
    </header>

    <main class="content">

      <!-- ── NEW ORDER ── -->
      {#if activeTab === "create"}
        <div class="panel">
          <div class="panel-head">
            <h2>Create Medication Order</h2>
            <p>Select a patient and medication, then fill in the prescription details.</p>
          </div>

          <div class="form-grid">
            <label class="field">
              <span>Patient *</span>
              <select bind:value={orderForm.patientId}>
                <option value="">— Select patient —</option>
                {#each patients as p}<option value={p.id}>{p.name} ({p.mrn})</option>{/each}
              </select>
            </label>
            <label class="field">
              <span>Medication *</span>
              <select bind:value={orderForm.medicationId}>
                <option value="">— Select medication —</option>
                {#each medications as m}<option value={m.id}>{m.name} — {m.dose} {m.route}</option>{/each}
              </select>
            </label>
            <label class="field">
              <span>Prescribed Dose *</span>
              <input placeholder="e.g. 500mg" bind:value={orderForm.prescribedDose}/>
            </label>
            <label class="field">
              <span>Route</span>
              <input placeholder="PO, IV, IM…" bind:value={orderForm.prescribedRoute}/>
            </label>
            <label class="field">
              <span>Scheduled Time *</span>
              <input type="time" bind:value={orderForm.scheduledTime}/>
            </label>
            <label class="field">
              <span>Prescription ID</span>
              <input placeholder="Rx identifier" bind:value={orderForm.prescriptionId}/>
            </label>
          </div>

          {#if orderForm.patientId && orderForm.medicationId}
            <div class="preview-card">
              <p class="preview-label">Order Preview</p>
              <div class="preview-grid">
                <div class="preview-item"><span>Patient</span><strong>{patientName(orderForm.patientId)}</strong></div>
                <div class="preview-item"><span>Medication</span><strong>{medName(orderForm.medicationId)}</strong></div>
                {#if orderForm.prescribedDose}<div class="preview-item"><span>Dose</span><strong>{orderForm.prescribedDose} {orderForm.prescribedRoute}</strong></div>{/if}
                {#if orderForm.scheduledTime}<div class="preview-item"><span>Scheduled</span><strong>{orderForm.scheduledTime}</strong></div>{/if}
              </div>
            </div>
          {/if}

          {#if formError}<p class="banner banner-error">⚠ {formError}</p>{/if}
          {#if formSuccess}<p class="banner banner-success">✓ {formSuccess}</p>{/if}

          <button class="btn btn-primary btn-block" on:click={submitOrder}>Submit Order</button>
        </div>

      <!-- ── ORDER STATUS ── -->
      {:else if activeTab === "orders"}
        <div class="panel">
          <div class="panel-head"><h2>Order Status</h2><p>Track all medication orders and their current pharmacy status.</p></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Patient</th><th>Medication</th><th>Dose</th><th>Route</th><th>Time</th><th>Rx ID</th><th>Status</th></tr></thead>
              <tbody>
                {#each myOrders as o}
                  <tr>
                    <td class="fw-600">{patientName(o.patientId)}</td>
                    <td>{medName(o.medicationId)}</td>
                    <td>{o.prescribedDose}</td>
                    <td>{o.prescribedRoute}</td>
                    <td>{o.scheduledTime}</td>
                    <td class="mono">{o.prescriptionId}</td>
                    <td><span class="order-status {o.status}">{o.status}</span></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ── PATIENTS ── -->
      {:else if activeTab === "patients"}
        <div class="panel">
          <div class="panel-head"><h2>Patient Directory</h2><p>View patient records. Contact the admin to add or modify records.</p></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>MRN</th><th>Name</th><th>Date of Birth</th><th>Ward</th><th>Active Orders</th></tr></thead>
              <tbody>
                {#each patients as p}
                  {@const patientOrders = orders.filter(o => o.patientId === p.id && o.status !== "dispensed")}
                  <tr>
                    <td class="mono">{p.id}</td>
                    <td>{p.mrn}</td>
                    <td class="fw-600">{p.name}</td>
                    <td>{p.dob}</td>
                    <td>{p.ward}</td>
                    <td>
                      {#if patientOrders.length > 0}
                        <span class="order-count">{patientOrders.length}</span>
                      {:else}
                        <span class="text-muted">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

    </main>
  </div>
</div>

<style>
  :global(*){box-sizing:border-box;margin:0}
  :global(body){font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;background:#f1f5f9;min-height:100vh}

  .shell { display:flex; min-height:100vh; }

  /* ── Sidebar ── */
  .sidebar { width:240px; flex-shrink:0; background:#0f172a; display:flex; flex-direction:column; position:sticky; top:0; height:100vh; overflow-y:auto; }
  .brand { display:flex; align-items:center; gap:12px; padding:24px 20px 20px; border-bottom:1px solid rgba(255,255,255,0.06); }
  .brand-logo { width:36px; height:36px; border-radius:10px; background:rgba(34,197,94,0.18); border:1px solid rgba(34,197,94,0.3); display:grid; place-items:center; font-size:16px; color:#86efac; flex-shrink:0; }
  .brand-app { font-size:13px; font-weight:800; color:#fff; }
  .brand-role { font-size:11px; color:#22c55e; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-top:1px; }
  nav { padding:12px 10px; flex:1; display:flex; flex-direction:column; gap:2px; }
  .nav-item { display:block; width:100%; text-align:left; padding:9px 12px; border-radius:8px; background:none; border:none; color:#94a3b8; font-size:13px; font-weight:600; cursor:pointer; transition:background 0.12s,color 0.12s; }
  .nav-item:hover { background:rgba(255,255,255,0.06); color:#e2e8f0; }
  .nav-item.active { background:rgba(34,197,94,0.14); color:#86efac; }
  .sidebar-footer { padding:16px 20px; border-top:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; gap:10px; }
  .user-row { display:flex; align-items:center; gap:10px; }
  .user-avatar { width:32px; height:32px; border-radius:50%; background:rgba(34,197,94,0.18); border:1px solid rgba(34,197,94,0.3); display:grid; place-items:center; font-size:13px; font-weight:800; color:#86efac; text-transform:uppercase; flex-shrink:0; }
  .user-name { font-size:13px; font-weight:600; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .btn-signout { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#94a3b8; font-size:12px; font-weight:600; padding:7px 12px; cursor:pointer; transition:background 0.12s; text-align:left; width:100%; }
  .btn-signout:hover { background:rgba(255,255,255,0.1); color:#e2e8f0; }

  /* ── Main ── */
  .main-wrap { flex:1; display:flex; flex-direction:column; min-width:0; }
  .page-header { background:#fff; border-bottom:1px solid #e2e8f0; padding:20px 28px; display:flex; justify-content:space-between; align-items:center; gap:24px; flex-wrap:wrap; }
  .page-eyebrow { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#16a34a; margin-bottom:4px; }
  .page-title { font-size:22px; font-weight:800; color:#0f172a; }
  .header-stats { display:flex; gap:24px; }
  .hstat { display:flex; flex-direction:column; align-items:center; gap:2px; }
  .hstat-val { font-size:20px; font-weight:800; color:#0f172a; line-height:1; }
  .hstat-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; }
  .hstat-blue .hstat-val { color:#1d4ed8; }
  .hstat-green .hstat-val { color:#16a34a; }

  .content { padding:24px 28px; display:flex; flex-direction:column; gap:20px; }

  /* ── Panel ── */
  .panel { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 1px 4px rgba(15,23,42,0.05); display:flex; flex-direction:column; gap:16px; }
  .panel-head h2 { font-size:17px; font-weight:800; color:#0f172a; }
  .panel-head p { font-size:13px; color:#64748b; margin-top:4px; line-height:1.5; }

  /* ── Form ── */
  .form-grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field span { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#374151; }
  input, select { border:1.5px solid #e2e8f0; border-radius:8px; padding:9px 12px; font-size:14px; color:#0f172a; background:#fff; width:100%; transition:border-color 0.15s,box-shadow 0.15s; }
  input:focus, select:focus { outline:none; border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.1); }
  input::placeholder { color:#94a3b8; }

  /* ── Preview ── */
  .preview-card { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; }
  .preview-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#15803d; margin-bottom:10px; }
  .preview-grid { display:flex; gap:20px; flex-wrap:wrap; }
  .preview-item { display:flex; flex-direction:column; gap:2px; }
  .preview-item span { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#6ee7b7; }
  .preview-item strong { font-size:14px; font-weight:700; color:#052e16; }

  /* ── Banners ── */
  .banner { border-radius:10px; padding:10px 14px; font-size:13px; font-weight:600; border:1px solid; }
  .banner-error  { background:#fef2f2; color:#b91c1c; border-color:#fecaca; }
  .banner-success { background:#f0fdf4; color:#166534; border-color:#86efac; }

  /* ── Buttons ── */
  .btn { border:none; border-radius:8px; font-weight:700; font-size:13px; padding:9px 16px; cursor:pointer; transition:filter 0.12s,transform 0.06s; }
  .btn:hover { filter:brightness(1.06); }
  .btn:active { transform:translateY(1px); }
  .btn-primary { background:#16a34a; color:#fff; box-shadow:0 2px 6px rgba(22,163,74,0.25); }
  .btn-block { width:100%; padding:13px; font-size:15px; }

  /* ── Table ── */
  .table-wrap { overflow:auto; border:1px solid #e2e8f0; border-radius:12px; }
  table { width:100%; border-collapse:collapse; min-width:600px; background:#fff; }
  thead tr { background:#f0fdf4; }
  th { padding:10px 14px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; font-weight:700; border-bottom:1px solid #e2e8f0; text-align:left; white-space:nowrap; }
  td { padding:11px 14px; border-bottom:1px solid #f1f5f9; font-size:13px; color:#374151; }
  tbody tr:last-child td { border-bottom:none; }
  tbody tr:hover td { background:#f8fafc; }
  td.mono { font-family:"SF Mono","Fira Code",monospace; font-size:12px; color:#475569; }
  td.fw-600 { font-weight:600; color:#0f172a; }
  .text-muted { color:#94a3b8; }

  .order-status { font-size:11px; font-weight:700; border-radius:6px; padding:3px 8px; border:1px solid; }
  .order-status.pending   { background:#fffbeb; color:#92400e; border-color:#fde68a; }
  .order-status.verified  { background:#eff6ff; color:#1e40af; border-color:#bfdbfe; }
  .order-status.dispensed { background:#f0fdf4; color:#166534; border-color:#bbf7d0; }

  .order-count { font-size:12px; font-weight:700; background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; border-radius:6px; padding:2px 8px; }
</style>
