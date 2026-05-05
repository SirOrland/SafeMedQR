<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { getMedications, getOrders, getPatients } from "$lib/api";
  import { clearSession, session } from "$lib/session";
  import type { Medication, MedicationOrder, Patient } from "$lib/types";

  let userName = "";
  let sidebarOpen = false;
  let sidebarCollapsed = false;
  let activeTab: "orders" | "patients" = "orders";

  let patients: Patient[] = [];
  let medications: Medication[] = [];
  let orders: MedicationOrder[] = [];

  onMount(async () => {
    const s = $session;
    if (!s || s.user.role !== "doctor") { await goto("/"); return; }
    userName = s.user.name;
    await loadAll();
  });

  async function loadAll() {
    [patients, medications, orders] = await Promise.all([getPatients(), getMedications(), getOrders()]);
  }

  function patientName(id: string) { return patients.find(p => p.id === id)?.name ?? id; }
  function medName(id: string)     { return medications.find(m => m.id === id)?.name ?? id; }

  $: pendingCount   = orders.filter(o => o.status === "pending").length;
  $: verifiedCount  = orders.filter(o => o.status === "verified").length;
  $: dispensedCount = orders.filter(o => o.status === "dispensed").length;
</script>

<svelte:head><title>Doctor Dashboard — SafeMedsQR</title></svelte:head>

<div class="shell">
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  {#if sidebarOpen}<div class="sidebar-overlay" on:click={() => sidebarOpen = false}></div>{/if}
  <aside class="sidebar" class:open={sidebarOpen} class:collapsed={sidebarCollapsed}>
    <div class="brand">
      <div class="brand-logo">✚</div>
      <div class="brand-text">
        <p class="brand-app">SafeMedsQR</p>
        <p class="brand-role">Doctor</p>
      </div>
      <button class="sidebar-close" on:click={() => sidebarOpen = false} aria-label="Close menu">✕</button>
      <button class="sidebar-collapse-btn" on:click={() => sidebarCollapsed = !sidebarCollapsed} aria-label="Collapse sidebar">{sidebarCollapsed ? '›' : '‹'}</button>
    </div>
    <nav>
      <button class="nav-item" class:active={activeTab==="orders"}   on:click={() => { activeTab="orders";   sidebarOpen=false; }}>Order Status</button>
      <button class="nav-item" class:active={activeTab==="patients"} on:click={() => { activeTab="patients"; sidebarOpen=false; }}>Patients</button>
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
    {#if sidebarCollapsed}
      <button class="sidebar-reopen" on:click={() => sidebarCollapsed = false} aria-label="Open sidebar">›</button>
    {/if}
    <header class="page-header">
      <div class="header-left">
        <button class="menu-btn" on:click={() => sidebarOpen = !sidebarOpen} aria-label="Toggle menu">☰</button>
        <div>
          <p class="page-eyebrow">Doctor Dashboard</p>
          <h1 class="page-title">{activeTab === "orders" ? "Order Status" : "Patients"}</h1>
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

      <!-- ── ORDER STATUS ── -->
      {#if activeTab === "orders"}
        <div class="panel">
          <div class="panel-head"><h2>Order Status</h2><p>Track all medication orders and their current pharmacy status.</p></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Patient</th><th>Medication</th><th>Dose</th><th>Route</th><th>Time</th><th>Rx ID</th><th>Status</th></tr></thead>
              <tbody>
                {#each orders as o}
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

  .brand-text { flex:1; min-width:0; }
  .sidebar-collapse-btn { display:flex; align-items:center; justify-content:center; margin-left:auto; flex-shrink:0; width:28px; height:28px; border-radius:6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#94a3b8; font-size:16px; cursor:pointer; transition:background 0.12s,color 0.12s; }
  .sidebar.collapsed { width:0; min-width:0; overflow:hidden; }
  .sidebar-reopen { position:fixed; left:0; top:50%; transform:translateY(-50%); background:#0f172a; border:1px solid rgba(255,255,255,0.12); border-left:none; border-radius:0 8px 8px 0; color:#93c5fd; width:18px; height:52px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:50; font-size:15px; transition:width 0.15s; }
  .sidebar-close { display:none; align-items:center; justify-content:center; margin-left:auto; flex-shrink:0; width:32px; height:32px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#94a3b8; font-size:14px; cursor:pointer; transition:background 0.12s,color 0.12s; }

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
    .table-wrap { -webkit-overflow-scrolling:touch; }
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
