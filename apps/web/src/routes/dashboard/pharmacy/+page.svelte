<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { getMedications, getOrders, getPatients, updateOrderStatus } from "$lib/api";
  import { clearSession, session } from "$lib/session";
  import type { Medication, MedicationOrder, Patient } from "$lib/types";

  let userName = "";
  let activeTab: "pending" | "all" = "pending";

  let patients: Patient[] = [];
  let medications: Medication[] = [];
  let orders: MedicationOrder[] = [];
  let updating: Set<string> = new Set();

  onMount(async () => {
    const s = $session;
    if (!s || s.user.role !== "pharmacist") { await goto("/"); return; }
    userName = s.user.name;
    await loadAll();
  });

  async function loadAll() {
    [patients, medications, orders] = await Promise.all([getPatients(), getMedications(), getOrders()]);
  }

  async function setStatus(orderId: string, status: "verified" | "dispensed") {
    updating = new Set([...updating, orderId]);
    try { await updateOrderStatus(orderId, status); await loadAll(); }
    finally { updating = new Set([...updating].filter(id => id !== orderId)); }
  }

  function patientName(id: string) { return patients.find(p => p.id === id)?.name ?? id; }
  function patientMrn(id: string)  { return patients.find(p => p.id === id)?.mrn ?? "—"; }
  function medName(id: string)     { return medications.find(m => m.id === id)?.name ?? id; }
  function medCode(id: string)     { return medications.find(m => m.id === id)?.code ?? "—"; }

  $: pendingOrders   = orders.filter(o => o.status === "pending");
  $: verifiedOrders  = orders.filter(o => o.status === "verified");
  $: dispensedOrders = orders.filter(o => o.status === "dispensed");
  $: shownOrders = activeTab === "pending" ? [...pendingOrders, ...verifiedOrders] : orders;
</script>

<svelte:head><title>Pharmacy Dashboard — SafeMedsQR</title></svelte:head>

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">✚</div>
      <div>
        <p class="brand-app">SafeMedsQR</p>
        <p class="brand-role">Pharmacy</p>
      </div>
    </div>
    <nav>
      <button class="nav-item" class:active={activeTab==="pending"} on:click={() => activeTab="pending"}>
        Incoming Orders
        {#if pendingOrders.length > 0}<span class="nav-badge">{pendingOrders.length}</span>{/if}
      </button>
      <button class="nav-item" class:active={activeTab==="all"} on:click={() => activeTab="all"}>All Orders</button>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="user-avatar">{userName[0] ?? "P"}</div>
        <span class="user-name">{userName}</span>
      </div>
      <button class="btn-signout" on:click={() => { clearSession(); goto("/"); }}>Sign out</button>
    </div>
  </aside>

  <div class="main-wrap">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">Pharmacy Dashboard</p>
        <h1 class="page-title">{activeTab === "pending" ? "Incoming Orders" : "All Orders"}</h1>
      </div>
      <div class="header-stats">
        <div class="hstat hstat-warn"><span class="hstat-val">{pendingOrders.length}</span><span class="hstat-label">Pending</span></div>
        <div class="hstat hstat-blue"><span class="hstat-val">{verifiedOrders.length}</span><span class="hstat-label">Verified</span></div>
        <div class="hstat hstat-green"><span class="hstat-val">{dispensedOrders.length}</span><span class="hstat-label">Dispensed</span></div>
        <div class="hstat"><span class="hstat-val">{orders.length}</span><span class="hstat-label">Total</span></div>
      </div>
    </header>

    <main class="content">
      <div class="panel">
        <div class="panel-head">
          {#if activeTab === "pending"}
            <h2>Incoming Orders</h2>
            <p>Review pending orders and verify or dispense them. Verified orders are ready for nurse administration.</p>
          {:else}
            <h2>All Orders</h2>
            <p>Full order history across all statuses.</p>
          {/if}
        </div>

        {#if shownOrders.length === 0}
          <div class="empty-state">
            <div class="empty-icon">✓</div>
            <p class="empty-title">All clear</p>
            <p class="empty-sub">No pending orders at this time.</p>
          </div>
        {:else}
          <div class="orders-list">
            {#each shownOrders as o}
              <div class="order-card" class:card-pending={o.status==="pending"} class:card-verified={o.status==="verified"} class:card-dispensed={o.status==="dispensed"}>
                <div class="order-body">
                  <div class="order-info">
                    <div class="info-col">
                      <span class="info-label">Patient</span>
                      <span class="info-value">{patientName(o.patientId)}</span>
                      <span class="info-sub">MRN: {patientMrn(o.patientId)}</span>
                    </div>
                    <div class="info-col">
                      <span class="info-label">Medication</span>
                      <span class="info-value">{medName(o.medicationId)}</span>
                      <span class="info-sub">{medCode(o.medicationId)}</span>
                    </div>
                    <div class="info-col">
                      <span class="info-label">Dose / Route</span>
                      <span class="info-value">{o.prescribedDose} {o.prescribedRoute}</span>
                    </div>
                    <div class="info-col">
                      <span class="info-label">Scheduled</span>
                      <span class="info-value">{o.scheduledTime}</span>
                    </div>
                    <div class="info-col">
                      <span class="info-label">Rx ID</span>
                      <span class="info-value mono">{o.prescriptionId}</span>
                    </div>
                  </div>

                  <div class="order-actions">
                    <span class="order-status {o.status}">{o.status}</span>
                    {#if o.status === "pending"}
                      <button class="btn btn-verify" disabled={updating.has(o.id)} on:click={() => setStatus(o.id, "verified")}>
                        {updating.has(o.id) ? "…" : "Verify"}
                      </button>
                    {:else if o.status === "verified"}
                      <button class="btn btn-dispense" disabled={updating.has(o.id)} on:click={() => setStatus(o.id, "dispensed")}>
                        {updating.has(o.id) ? "…" : "Dispense"}
                      </button>
                    {:else}
                      <span class="dispensed-check">✓ Dispensed</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
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
  .brand-logo { width:36px; height:36px; border-radius:10px; background:rgba(168,85,247,0.18); border:1px solid rgba(168,85,247,0.3); display:grid; place-items:center; font-size:16px; color:#d8b4fe; flex-shrink:0; }
  .brand-app { font-size:13px; font-weight:800; color:#fff; }
  .brand-role { font-size:11px; color:#a855f7; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-top:1px; }
  nav { padding:12px 10px; flex:1; display:flex; flex-direction:column; gap:2px; }
  .nav-item { display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; padding:9px 12px; border-radius:8px; background:none; border:none; color:#94a3b8; font-size:13px; font-weight:600; cursor:pointer; transition:background 0.12s,color 0.12s; }
  .nav-item:hover { background:rgba(255,255,255,0.06); color:#e2e8f0; }
  .nav-item.active { background:rgba(168,85,247,0.14); color:#d8b4fe; }
  .nav-badge { background:#a855f7; color:#fff; font-size:10px; font-weight:800; border-radius:999px; padding:1px 7px; min-width:18px; text-align:center; }
  .sidebar-footer { padding:16px 20px; border-top:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; gap:10px; }
  .user-row { display:flex; align-items:center; gap:10px; }
  .user-avatar { width:32px; height:32px; border-radius:50%; background:rgba(168,85,247,0.18); border:1px solid rgba(168,85,247,0.3); display:grid; place-items:center; font-size:13px; font-weight:800; color:#d8b4fe; text-transform:uppercase; flex-shrink:0; }
  .user-name { font-size:13px; font-weight:600; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .btn-signout { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#94a3b8; font-size:12px; font-weight:600; padding:7px 12px; cursor:pointer; transition:background 0.12s; text-align:left; width:100%; }
  .btn-signout:hover { background:rgba(255,255,255,0.1); color:#e2e8f0; }

  /* ── Main ── */
  .main-wrap { flex:1; display:flex; flex-direction:column; min-width:0; }
  .page-header { background:#fff; border-bottom:1px solid #e2e8f0; padding:20px 28px; display:flex; justify-content:space-between; align-items:center; gap:24px; flex-wrap:wrap; }
  .page-eyebrow { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#a855f7; margin-bottom:4px; }
  .page-title { font-size:22px; font-weight:800; color:#0f172a; }
  .header-stats { display:flex; gap:24px; }
  .hstat { display:flex; flex-direction:column; align-items:center; gap:2px; }
  .hstat-val { font-size:20px; font-weight:800; color:#0f172a; line-height:1; }
  .hstat-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; }
  .hstat-warn .hstat-val  { color:#d97706; }
  .hstat-blue .hstat-val  { color:#1d4ed8; }
  .hstat-green .hstat-val { color:#16a34a; }

  .content { padding:24px 28px; display:flex; flex-direction:column; gap:20px; }

  /* ── Panel ── */
  .panel { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 1px 4px rgba(15,23,42,0.05); display:flex; flex-direction:column; gap:16px; }
  .panel-head h2 { font-size:17px; font-weight:800; color:#0f172a; }
  .panel-head p { font-size:13px; color:#64748b; margin-top:4px; line-height:1.5; }

  /* ── Empty ── */
  .empty-state { text-align:center; padding:56px 24px; display:flex; flex-direction:column; align-items:center; gap:10px; }
  .empty-icon { width:56px; height:56px; border-radius:50%; background:#f0fdf4; border:2px solid #bbf7d0; display:grid; place-items:center; font-size:22px; color:#16a34a; }
  .empty-title { font-size:16px; font-weight:700; color:#0f172a; }
  .empty-sub { font-size:13px; color:#64748b; }

  /* ── Order cards ── */
  .orders-list { display:flex; flex-direction:column; gap:10px; }
  .order-card { border:1px solid #e2e8f0; border-radius:12px; background:#fff; overflow:hidden; transition:box-shadow 0.15s; }
  .order-card:hover { box-shadow:0 4px 16px rgba(15,23,42,0.08); }
  .card-pending  { border-left:4px solid #eab308; }
  .card-verified { border-left:4px solid #3b82f6; }
  .card-dispensed { border-left:4px solid #22c55e; opacity:0.75; }

  .order-body { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 18px; flex-wrap:wrap; }
  .order-info { display:flex; gap:28px; flex-wrap:wrap; flex:1; }
  .info-col { display:flex; flex-direction:column; gap:2px; min-width:90px; }
  .info-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; }
  .info-value { font-size:14px; font-weight:700; color:#0f172a; }
  .info-sub { font-size:11px; color:#64748b; }
  .mono { font-family:"SF Mono","Fira Code",monospace; font-size:13px; }

  .order-actions { display:flex; flex-direction:column; gap:8px; align-items:flex-end; flex-shrink:0; }

  /* ── Buttons ── */
  .btn { border:none; border-radius:8px; font-weight:700; font-size:13px; padding:8px 18px; cursor:pointer; transition:filter 0.12s,transform 0.06s; }
  .btn:hover:not(:disabled) { filter:brightness(1.06); }
  .btn:active { transform:translateY(1px); }
  .btn:disabled { opacity:0.6; cursor:default; }
  .btn-verify  { background:#1d4ed8; color:#fff; }
  .btn-dispense { background:#16a34a; color:#fff; }
  .dispensed-check { font-size:12px; font-weight:700; color:#16a34a; }

  /* ── Status badge ── */
  .order-status { font-size:11px; font-weight:700; border-radius:6px; padding:3px 8px; border:1px solid; }
  .order-status.pending   { background:#fffbeb; color:#92400e; border-color:#fde68a; }
  .order-status.verified  { background:#eff6ff; color:#1e40af; border-color:#bfdbfe; }
  .order-status.dispensed { background:#f0fdf4; color:#166534; border-color:#bbf7d0; }
</style>
