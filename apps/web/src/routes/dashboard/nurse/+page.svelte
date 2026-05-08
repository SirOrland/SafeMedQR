<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { createMedication, createOrder, deleteMedication, deleteOrder, getMedications, getOrders, getPatients } from "$lib/api";
  import { clearSession, session } from "$lib/session";
  import type { Medication, MedicationOrder, Patient } from "$lib/types";

  let userName = "";
  let sidebarOpen = false;
  let sidebarCollapsed = false;
  let activeTab: "create" | "orders" | "patients" | "medications" = "create";

  let patients: Patient[] = [];
  let medications: Medication[] = [];
  let orders: MedicationOrder[] = [];

  const todayIso = () => new Date().toISOString().slice(0, 10);

  let orderForm = {
    patientId: "", medicationId: "", prescribedDose: "",
    prescribedRoute: "", scheduledDate: todayIso(), scheduledTime: "08:00",
    prescriptionId: "", active: true
  };
  let orderDatePickerOpen = false;
  let orderTimePickerOpen = false;
  let orderPickerHour = 8;
  let orderPickerMinute = 0;
  let formError = "";
  let formSuccess = "";
  let medForm = { name: "", dose: "", route: "" };

  function fmtDateLabel(d: string) {
    const today    = todayIso();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if (d === today)    return "Today";
    if (d === tomorrow) return "Tomorrow";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  onMount(async () => {
    const s = $session;
    if (!s || s.user.role !== "nurse") { await goto("/"); return; }
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
      await createOrder({ ...orderForm, scheduledTime: `${orderForm.scheduledDate}T${orderForm.scheduledTime}` });
      formSuccess = "Order created successfully.";
      orderForm = { patientId: "", medicationId: "", prescribedDose: "", prescribedRoute: "", scheduledDate: todayIso(), scheduledTime: "08:00", prescriptionId: "", active: true };
      await loadAll();
    } catch (e: unknown) {
      formError = e instanceof Error ? e.message : "Failed to create order";
    }
  }

  async function addMed() { await createMedication(medForm); medForm = { name: "", dose: "", route: "" }; await loadAll(); }

  function patientName(id: string) { return patients.find(p => p.id === id)?.name ?? id; }
  function medName(id: string)     { return medications.find(m => m.id === id)?.name ?? id; }
  function fmtDate(st: string) {
    if (st.length > 5) {
      const d = st.split("T")[0];
      return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return "—";
  }
  function fmtTime(st: string) { return st.length > 5 ? st.split("T")[1] : st; }

  $: pendingCount   = orders.filter(o => o.status === "pending").length;
  $: verifiedCount  = orders.filter(o => o.status === "verified").length;
  $: dispensedCount = orders.filter(o => o.status === "dispensed").length;
</script>

<svelte:head><title>Nurse Dashboard — SafeMedsQR</title></svelte:head>
<svelte:window on:click={() => { orderDatePickerOpen = false; orderTimePickerOpen = false; }} />

<div class="shell">
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  {#if sidebarOpen}<div class="sidebar-overlay" on:click={() => sidebarOpen = false}></div>{/if}
  <aside class="sidebar" class:open={sidebarOpen} class:collapsed={sidebarCollapsed}>
    <div class="brand">
      <div class="brand-logo">✚</div>
      <div class="brand-text">
        <p class="brand-app">SafeMedsQR</p>
        <p class="brand-role">Nurse</p>
      </div>
      <button class="sidebar-close" on:click={() => sidebarOpen = false} aria-label="Close menu">✕</button>
      <button class="sidebar-collapse-btn" on:click={() => sidebarCollapsed = !sidebarCollapsed} aria-label="Collapse sidebar">{sidebarCollapsed ? '›' : '‹'}</button>
    </div>
    <nav>
      <button class="nav-item" class:active={activeTab==="create"}      on:click={() => { activeTab="create";      sidebarOpen=false; }}>New Order</button>
      <button class="nav-item" class:active={activeTab==="orders"}      on:click={() => { activeTab="orders";      sidebarOpen=false; }}>Order Status</button>
      <button class="nav-item" class:active={activeTab==="patients"}    on:click={() => { activeTab="patients";    sidebarOpen=false; }}>Patients</button>
      <button class="nav-item" class:active={activeTab==="medications"} on:click={() => { activeTab="medications"; sidebarOpen=false; }}>Medications</button>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="user-avatar">{userName[0] ?? "N"}</div>
        <span class="user-name">{userName}</span>
      </div>
      <button class="btn-signout" on:click={() => { clearSession(); goto("/"); }}>Sign out</button>
    </div>
  </aside>

  <div class="main-wrap">
    {#if sidebarCollapsed}
      <button class="sidebar-reopen" on:click={() => sidebarCollapsed = false} aria-label="Open sidebar">›</button>
    {/if}
    <header class="page-header">
      <div class="header-left">
        <button class="menu-btn" on:click={() => sidebarOpen = !sidebarOpen} aria-label="Toggle menu">☰</button>
        <div>
          <p class="page-eyebrow">Nurse Dashboard</p>
          <h1 class="page-title">
            {activeTab === "create" ? "New Order" : activeTab === "orders" ? "Order Status" : activeTab === "medications" ? "Medications" : "Patients"}
          </h1>
        </div>
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

          <div class="form-grid order-grid">
            <label class="field">
              <span>Patient *</span>
              <select bind:value={orderForm.patientId}>
                <option value="">— Select patient —</option>
                {#each patients as p}<option value={p.id}>{p.name} ({p.mrn})</option>{/each}
              </select>
            </label>
            <label class="field">
              <span>Medication *</span>
              <select bind:value={orderForm.medicationId} on:change={() => {
                const med = medications.find(m => m.id === orderForm.medicationId);
                if (med) { orderForm.prescribedDose = med.dose; orderForm.prescribedRoute = med.route; }
              }}>
                <option value="">— Select medication —</option>
                {#each medications as m}<option value={m.id}>{m.name} — {m.dose} {m.route}</option>{/each}
              </select>
            </label>
            <label class="field">
              <span>Dose *</span>
              <input placeholder="e.g. 500mg" bind:value={orderForm.prescribedDose}/>
            </label>
            <label class="field">
              <span>Route</span>
              <input placeholder="PO, IV, IM…" bind:value={orderForm.prescribedRoute}/>
            </label>

            <!-- Date picker -->
            <div class="field dt-field">
              <span>Date</span>
              <div class="dt-wrap">
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <button class="dt-pick-btn" on:click|stopPropagation={() => { orderDatePickerOpen = !orderDatePickerOpen; orderTimePickerOpen = false; }}>
                  📅 {fmtDateLabel(orderForm.scheduledDate)}
                </button>
                {#if orderDatePickerOpen}
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <div class="dt-panel" on:click|stopPropagation>
                    <div class="dt-quick-row">
                      {#each [
                        { label: "Today",    val: todayIso() },
                        { label: "Tomorrow", val: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
                        { label: "+2 Days",  val: new Date(Date.now() + 172800000).toISOString().slice(0, 10) },
                      ] as q}
                        <button class="dt-quick-btn" class:dt-quick-sel={orderForm.scheduledDate === q.val}
                          on:click={() => { orderForm.scheduledDate = q.val; }}>
                          {q.label}
                        </button>
                      {/each}
                    </div>
                    <div class="dt-nav-row">
                      <button class="dt-nav-btn" on:click={() => { const d = new Date(orderForm.scheduledDate + "T00:00:00"); d.setDate(d.getDate() - 1); orderForm.scheduledDate = d.toISOString().slice(0, 10); }}>‹</button>
                      <div class="dt-nav-center">
                        <span class="dt-nav-date">{new Date(orderForm.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
                        <span class="dt-nav-year">{new Date(orderForm.scheduledDate + "T00:00:00").getFullYear()}</span>
                      </div>
                      <button class="dt-nav-btn" on:click={() => { const d = new Date(orderForm.scheduledDate + "T00:00:00"); d.setDate(d.getDate() + 1); orderForm.scheduledDate = d.toISOString().slice(0, 10); }}>›</button>
                    </div>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Time picker -->
            <div class="field dt-field">
              <span>Time</span>
              <div class="dt-wrap">
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <button class="dt-pick-btn" on:click|stopPropagation={() => {
                  [orderPickerHour, orderPickerMinute] = orderForm.scheduledTime.split(":").map(Number);
                  orderTimePickerOpen = !orderTimePickerOpen;
                  orderDatePickerOpen = false;
                }}>
                  🕐 {orderForm.scheduledTime}
                </button>
                {#if orderTimePickerOpen}
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <div class="dt-panel tp-panel" on:click|stopPropagation>
                    <div class="tp-body">
                      <div class="tp-col">
                        <span class="tp-col-label">Hour</span>
                        <button class="tp-arrow" on:click={() => orderPickerHour = (orderPickerHour + 1) % 24}>▲</button>
                        <span class="tp-display">{String(orderPickerHour).padStart(2, "0")}</span>
                        <button class="tp-arrow" on:click={() => orderPickerHour = (orderPickerHour + 23) % 24}>▼</button>
                      </div>
                      <span class="tp-sep">:</span>
                      <div class="tp-col">
                        <span class="tp-col-label">Min</span>
                        <button class="tp-arrow" on:click={() => orderPickerMinute = (orderPickerMinute + 5) % 60}>▲</button>
                        <span class="tp-display">{String(orderPickerMinute).padStart(2, "0")}</span>
                        <button class="tp-arrow" on:click={() => orderPickerMinute = (orderPickerMinute + 55) % 60}>▼</button>
                      </div>
                    </div>
                    <button class="tp-confirm-btn" on:click={() => {
                      orderForm.scheduledTime = `${String(orderPickerHour).padStart(2, "0")}:${String(orderPickerMinute).padStart(2, "0")}`;
                      orderTimePickerOpen = false;
                    }}>Confirm Time</button>
                  </div>
                {/if}
              </div>
            </div>

            <label class="field">
              <span>Rx ID</span>
              <input placeholder="Prescription ID" bind:value={orderForm.prescriptionId}/>
            </label>
          </div>

          {#if orderForm.patientId && orderForm.medicationId}
            <div class="preview-card">
              <p class="preview-label">Order Preview</p>
              <div class="preview-grid">
                <div class="preview-item"><span>Patient</span><strong>{patientName(orderForm.patientId)}</strong></div>
                <div class="preview-item"><span>Medication</span><strong>{medName(orderForm.medicationId)}</strong></div>
                {#if orderForm.prescribedDose}<div class="preview-item"><span>Dose</span><strong>{orderForm.prescribedDose} {orderForm.prescribedRoute}</strong></div>{/if}
                {#if orderForm.scheduledTime}<div class="preview-item"><span>Scheduled</span><strong>{fmtDateLabel(orderForm.scheduledDate)} · {orderForm.scheduledTime}</strong></div>{/if}
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
              <thead><tr><th>Patient</th><th>Medication</th><th>Dose</th><th>Route</th><th>Date</th><th>Time</th><th>Rx ID</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {#each orders as o}
                  <tr>
                    <td class="fw-600">{patientName(o.patientId)}</td>
                    <td>{medName(o.medicationId)}</td>
                    <td>{o.prescribedDose}</td>
                    <td>{o.prescribedRoute}</td>
                    <td>{fmtDate(o.scheduledTime)}</td>
                    <td class="mono">{fmtTime(o.scheduledTime)}</td>
                    <td class="mono">{o.prescriptionId || "—"}</td>
                    <td><span class="order-status {o.status}">{o.status}</span></td>
                    <td><button class="btn btn-sm btn-danger" on:click={() => deleteOrder(o.id).then(loadAll)}>Delete</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ── MEDICATIONS ── -->
      {:else if activeTab === "medications"}
        <div class="panel">
          <div class="panel-head">
            <h2>Medications</h2>
            <p>Maintain medication master data used during scan verification.</p>
          </div>
          <div class="form-grid">
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

      <!-- ── PATIENTS ── -->
      {:else if activeTab === "patients"}
        <div class="panel">
          <div class="panel-head"><h2>Patient Directory</h2><p>View patient records assigned to your ward.</p></div>
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
  .brand-logo { width:36px; height:36px; border-radius:10px; background:rgba(14,165,233,0.18); border:1px solid rgba(14,165,233,0.3); display:grid; place-items:center; font-size:16px; color:#7dd3fc; flex-shrink:0; }
  .brand-app { font-size:13px; font-weight:800; color:#fff; }
  .brand-role { font-size:11px; color:#0ea5e9; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-top:1px; }
  nav { padding:12px 10px; flex:1; display:flex; flex-direction:column; gap:2px; }
  .nav-item { display:block; width:100%; text-align:left; padding:9px 12px; border-radius:8px; background:none; border:none; color:#94a3b8; font-size:13px; font-weight:600; cursor:pointer; transition:background 0.12s,color 0.12s; }
  .nav-item:hover { background:rgba(255,255,255,0.06); color:#e2e8f0; }
  .nav-item.active { background:rgba(14,165,233,0.14); color:#7dd3fc; }
  .sidebar-footer { padding:16px 20px; border-top:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; gap:10px; }
  .user-row { display:flex; align-items:center; gap:10px; }
  .user-avatar { width:32px; height:32px; border-radius:50%; background:rgba(14,165,233,0.18); border:1px solid rgba(14,165,233,0.3); display:grid; place-items:center; font-size:13px; font-weight:800; color:#7dd3fc; text-transform:uppercase; flex-shrink:0; }
  .user-name { font-size:13px; font-weight:600; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .btn-signout { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#94a3b8; font-size:12px; font-weight:600; padding:7px 12px; cursor:pointer; transition:background 0.12s; text-align:left; width:100%; }
  .btn-signout:hover { background:rgba(255,255,255,0.1); color:#e2e8f0; }

  /* ── Main ── */
  .main-wrap { flex:1; display:flex; flex-direction:column; min-width:0; }
  .page-header { background:#fff; border-bottom:1px solid #e2e8f0; padding:20px 28px; display:flex; justify-content:space-between; align-items:center; gap:24px; flex-wrap:wrap; }
  .page-eyebrow { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#0284c7; margin-bottom:4px; }
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
  .order-grid { grid-template-columns:repeat(auto-fit,minmax(175px,1fr)); }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field span { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#374151; }
  input, select { border:1.5px solid #e2e8f0; border-radius:8px; padding:9px 12px; font-size:14px; color:#0f172a; background:#fff; width:100%; transition:border-color 0.15s,box-shadow 0.15s; }
  input:focus, select:focus { outline:none; border-color:#0ea5e9; box-shadow:0 0 0 3px rgba(14,165,233,0.1); }
  input::placeholder { color:#94a3b8; }

  /* ── Preview ── */
  .preview-card { background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:16px; }
  .preview-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#0369a1; margin-bottom:10px; }
  .preview-grid { display:flex; gap:20px; flex-wrap:wrap; }
  .preview-item { display:flex; flex-direction:column; gap:2px; }
  .preview-item span { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#7dd3fc; }
  .preview-item strong { font-size:14px; font-weight:700; color:#0c4a6e; }

  /* ── Banners ── */
  .banner { border-radius:10px; padding:10px 14px; font-size:13px; font-weight:600; border:1px solid; }
  .banner-error   { background:#fef2f2; color:#b91c1c; border-color:#fecaca; }
  .banner-success { background:#f0fdf4; color:#166534; border-color:#86efac; }

  /* ── Buttons ── */
  .btn { border:none; border-radius:8px; font-weight:700; font-size:13px; padding:9px 16px; cursor:pointer; transition:filter 0.12s,transform 0.06s; }
  .btn:hover { filter:brightness(1.06); }
  .btn:active { transform:translateY(1px); }
  .btn-primary { background:#0284c7; color:#fff; box-shadow:0 2px 6px rgba(2,132,199,0.25); }
  .btn-sm { padding:6px 10px; font-size:12px; }
  .btn-danger { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; }
  .btn-block { width:100%; padding:13px; font-size:15px; }
  .align-end { align-self:end; }

  /* ── Table ── */
  .table-wrap { overflow:auto; border:1px solid #e2e8f0; border-radius:12px; }
  table { width:100%; border-collapse:collapse; min-width:600px; background:#fff; }
  thead tr { background:#f0f9ff; }
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

  .order-count { font-size:12px; font-weight:700; background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; border-radius:6px; padding:2px 8px; }

  .brand-text { flex:1; min-width:0; }
  .sidebar-collapse-btn { display:flex; align-items:center; justify-content:center; margin-left:auto; flex-shrink:0; width:28px; height:28px; border-radius:6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#94a3b8; font-size:16px; cursor:pointer; transition:background 0.12s,color 0.12s; }
  .sidebar.collapsed { width:0; min-width:0; overflow:hidden; }
  .sidebar-reopen { position:fixed; left:0; top:50%; transform:translateY(-50%); background:#0f172a; border:1px solid rgba(255,255,255,0.12); border-left:none; border-radius:0 8px 8px 0; color:#93c5fd; width:18px; height:52px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:50; font-size:15px; transition:width 0.15s; }
  .sidebar-close { display:none; align-items:center; justify-content:center; margin-left:auto; flex-shrink:0; width:32px; height:32px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#94a3b8; font-size:14px; cursor:pointer; transition:background 0.12s,color 0.12s; }

  /* ── Date / Time pickers ── */
  .dt-field { position:relative; }
  .dt-wrap  { position:relative; }
  .dt-pick-btn { width:100%; text-align:left; display:flex; align-items:center; gap:8px; border:1.5px solid #e2e8f0; border-radius:8px; padding:9px 12px; font-size:14px; font-weight:600; color:#0f172a; background:#fff; cursor:pointer; transition:border-color 0.15s,box-shadow 0.15s; }
  .dt-pick-btn:hover { border-color:#0ea5e9; box-shadow:0 0 0 3px rgba(14,165,233,0.1); }
  .dt-panel { position:absolute; top:calc(100% + 6px); left:0; z-index:100; background:#fff; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 8px 32px rgba(15,23,42,0.14); min-width:280px; padding:14px; display:flex; flex-direction:column; gap:10px; }
  .dt-quick-row { display:flex; gap:6px; }
  .dt-quick-btn { flex:1; border:1.5px solid #e2e8f0; border-radius:8px; padding:7px 4px; font-size:12px; font-weight:700; color:#475569; background:#f8fafc; cursor:pointer; transition:all 0.12s; }
  .dt-quick-btn:hover { border-color:#0ea5e9; color:#0284c7; background:#f0f9ff; }
  .dt-quick-sel { border-color:#0ea5e9 !important; color:#0284c7 !important; background:#f0f9ff !important; }
  .dt-nav-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .dt-nav-btn { width:32px; height:32px; border:1.5px solid #e2e8f0; border-radius:8px; background:#f8fafc; font-size:18px; font-weight:600; color:#0284c7; cursor:pointer; display:grid; place-items:center; flex-shrink:0; transition:background 0.12s; }
  .dt-nav-btn:hover { background:#f0f9ff; border-color:#0ea5e9; }
  .dt-nav-center { flex:1; text-align:center; }
  .dt-nav-date { display:block; font-size:13px; font-weight:700; color:#0f172a; }
  .dt-nav-year { display:block; font-size:11px; color:#94a3b8; margin-top:2px; }
  .tp-panel { min-width:220px; }
  .tp-body { display:flex; align-items:center; justify-content:center; gap:4px; padding:4px 0 8px; }
  .tp-col { display:flex; flex-direction:column; align-items:center; gap:6px; }
  .tp-col-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; }
  .tp-arrow { width:36px; height:36px; border:1.5px solid #e2e8f0; border-radius:8px; background:#f0f9ff; font-size:14px; color:#0284c7; cursor:pointer; display:grid; place-items:center; transition:background 0.1s; }
  .tp-arrow:hover { background:#bae6fd; }
  .tp-display { font-size:36px; font-weight:800; color:#0f172a; min-width:56px; text-align:center; line-height:1.1; }
  .tp-sep { font-size:32px; font-weight:300; color:#94a3b8; align-self:center; padding:0 2px; margin-top:18px; }
  .tp-confirm-btn { width:100%; padding:9px; border:none; border-radius:8px; background:#0284c7; color:#fff; font-size:13px; font-weight:700; cursor:pointer; transition:filter 0.12s; }
  .tp-confirm-btn:hover { filter:brightness(1.08); }

  /* ── Responsive ── */
  .header-left { display:flex; align-items:center; gap:10px; }
  .menu-btn { display:none; background:none; border:none; font-size:22px; color:#0f172a; cursor:pointer; padding:4px 8px; border-radius:6px; line-height:1; flex-shrink:0; }
  .menu-btn:hover { background:#f1f5f9; }
  .sidebar-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(2px); z-index:99; }

  /* Tablet + Mobile (≤ 1024px) — sidebar becomes a slide-over */
  @media (max-width:1024px) {
    :global(html), :global(body) { overflow-x:hidden; }
    .menu-btn { display:flex; align-items:center; justify-content:center; }
    .sidebar { position:fixed; z-index:100; width:280px; max-width:85vw; height:100vh; height:100dvh; transform:translateX(-100%); transition:transform 0.25s ease; }
    .sidebar.open { transform:translateX(0); }
    .nav-item { min-height:44px; }
    .page-header { padding:14px 20px; gap:12px; flex-wrap:wrap; }
    .header-stats { gap:16px; flex-wrap:wrap; }
    .hstat-val { font-size:18px; }
    .content { padding:20px; }
    .panel { padding:20px; }
    input, select { font-size:16px; }
    .btn { min-height:40px; }
    .btn-block { padding:14px; font-size:16px; }
    .sidebar.collapsed { width:280px; max-width:85vw; overflow:visible; }
    .sidebar-close { display:flex; }
    .sidebar-collapse-btn { display:none; }
    .sidebar-reopen { display:none; }
  }

  /* Mobile only (≤ 768px) */
  @media (max-width:768px) {
    .page-header { padding:12px 16px; }
    .content { padding:14px; }
    .panel { padding:14px; }
    .form-grid { grid-template-columns:1fr; }
    .order-grid { grid-template-columns:1fr; }
    .preview-grid { flex-direction:column; gap:10px; }
    .table-wrap { -webkit-overflow-scrolling:touch; }
    input, select { font-size:16px; }
    .btn { min-height:40px; }
    .dt-panel { max-width:calc(100vw - 32px); }
  }

  /* Small phone (≤ 480px) */
  @media (max-width:480px) {
    .page-header { flex-direction:column; align-items:flex-start; gap:8px; padding:10px 14px; }
    .header-stats { gap:14px; }
    .page-title { font-size:18px; }
    .hstat-val { font-size:16px; }
    .content { padding:10px; }
    .panel { padding:12px; }
  }
</style>
