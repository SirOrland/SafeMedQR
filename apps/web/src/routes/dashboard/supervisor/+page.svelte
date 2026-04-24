<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { getLogs, getMedications, getOrders, getPatients, getThresholds } from "$lib/api";
  import { clearSession, session } from "$lib/session";
  import type { AlertThreshold, Medication, MedicationOrder, Patient, ScanLog } from "$lib/types";

  let userName = "";
  let activeTab: "overview" | "compliance" | "alerts" = "overview";

  let patients: Patient[] = [];
  let medications: Medication[] = [];
  let orders: MedicationOrder[] = [];
  let logs: ScanLog[] = [];
  let thresholds: AlertThreshold[] = [];

  onMount(async () => {
    const s = $session;
    if (!s || s.user.role !== "chief_nurse") { await goto("/"); return; }
    userName = s.user.name;
    await loadAll();
  });

  async function loadAll() {
    [patients, medications, orders, logs, thresholds] = await Promise.all([
      getPatients(), getMedications(), getOrders(), getLogs(), getThresholds()
    ]);
  }

  function setTab(key: string) { activeTab = key as typeof activeTab; }

  function patientName(id: string) { return patients.find(p => p.id === id)?.name ?? id; }
  function medName(id: string) { return medications.find(m => m.id === id)?.name ?? id; }

  function isOverdue(order: MedicationOrder): boolean {
    const [h, m] = order.scheduledTime.split(":").map(Number);
    const scheduled = new Date();
    scheduled.setHours(h, m, 0, 0);
    const overdueMins = thresholds.find(t => t.metric === "overdue_minutes")?.thresholdValue ?? 30;
    return Date.now() > scheduled.getTime() + overdueMins * 60 * 1000;
  }

  $: pendingOrders   = orders.filter(o => o.status === "pending");
  $: overdueOrders   = pendingOrders.filter(o => isOverdue(o));
  $: totalScans      = logs.length;
  $: errorScans      = logs.filter(l => l.errorTypes.length > 0).length;
  $: errorRate       = totalScans > 0 ? Math.round((errorScans / totalScans) * 100) : 0;
  $: errorThreshold  = thresholds.find(t => t.metric === "error_rate_percent")?.thresholdValue ?? 10;
  $: errorAlert      = errorRate >= errorThreshold;

  $: errorsByType = logs.reduce<Record<string, number>>((acc, log) => {
    for (const e of log.errorTypes) acc[e] = (acc[e] ?? 0) + 1;
    return acc;
  }, {});

  $: recentLogs = logs.slice(0, 15);

  const TABS: Record<"overview" | "compliance" | "alerts", string> = {
    overview: "Overview",
    compliance: "Compliance",
    alerts: "Alerts",
  };
</script>

<svelte:head><title>Chief Nurse Dashboard — SafeMedsQR</title></svelte:head>

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">✚</div>
      <div>
        <p class="brand-app">SafeMedsQR</p>
        <p class="brand-role">Chief Nurse</p>
      </div>
    </div>
    <nav>
      {#each Object.entries(TABS) as [key, label]}
        <button class="nav-item" class:active={activeTab === key} on:click={() => setTab(key)}>
          {label}
          {#if key === "alerts" && (errorAlert || overdueOrders.length > 0)}
            <span class="nav-badge">{(errorAlert ? 1 : 0) + (overdueOrders.length > 0 ? 1 : 0)}</span>
          {/if}
        </button>
      {/each}
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="user-avatar">{userName[0] ?? "C"}</div>
        <span class="user-name">{userName}</span>
      </div>
      <button class="btn-signout" on:click={() => { clearSession(); goto("/"); }}>Sign out</button>
    </div>
  </aside>

  <div class="main-wrap">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">Chief Nurse Dashboard</p>
        <h1 class="page-title">{TABS[activeTab]}</h1>
      </div>
      <div class="header-stats">
        <div class="hstat"><span class="hstat-val">{patients.length}</span><span class="hstat-label">Patients</span></div>
        <div class="hstat"><span class="hstat-val">{totalScans}</span><span class="hstat-label">Scans</span></div>
        <div class="hstat" class:hstat-warn={overdueOrders.length > 0}><span class="hstat-val">{overdueOrders.length}</span><span class="hstat-label">Overdue</span></div>
        <div class="hstat" class:hstat-err={errorAlert}><span class="hstat-val">{errorRate}%</span><span class="hstat-label">Error Rate</span></div>
      </div>
    </header>

    <main class="content">

      {#if errorAlert}
        <div class="alert-banner alert-error">
          <span class="banner-icon">⚠</span>
          <div>
            <strong>Error Rate Alert</strong> — Current rate is {errorRate}%, above the {errorThreshold}% threshold.
            <span class="banner-action">Review the Compliance tab.</span>
          </div>
        </div>
      {/if}

      {#if overdueOrders.length > 0}
        <div class="alert-banner alert-warn">
          <span class="banner-icon">⏰</span>
          <div>
            <strong>{overdueOrders.length} Overdue Order{overdueOrders.length > 1 ? "s" : ""}</strong> — Past scheduled administration time and still pending.
          </div>
        </div>
      {/if}

      <!-- ── OVERVIEW ── -->
      {#if activeTab === "overview"}
        <div class="two-col">
          <div class="panel">
            <div class="panel-head">
              <h2>Pending Orders</h2>
              <p>{pendingOrders.length} order{pendingOrders.length !== 1 ? "s" : ""} waiting for pharmacy verification.</p>
            </div>
            {#if pendingOrders.length === 0}
              <div class="empty-state">
                <div class="empty-icon">✓</div>
                <p class="empty-title">No pending orders</p>
                <p class="empty-sub">All orders have been processed.</p>
              </div>
            {:else}
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Medication</th>
                      <th>Scheduled</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each pendingOrders as o}
                      <tr class:row-overdue={isOverdue(o)}>
                        <td class="fw-600">{patientName(o.patientId)}</td>
                        <td>{medName(o.medicationId)}</td>
                        <td class="mono">{o.scheduledTime}</td>
                        <td>
                          {#if isOverdue(o)}
                            <span class="badge badge-overdue">Overdue</span>
                          {:else}
                            <span class="badge badge-pending">Pending</span>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2>Recent Scans</h2>
              <p>Last 15 medication administration events.</p>
            </div>
            {#if recentLogs.length === 0}
              <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p class="empty-title">No scan events</p>
                <p class="empty-sub">Administration scans will appear here.</p>
              </div>
            {:else}
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Patient</th>
                      <th>Medication</th>
                      <th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each recentLogs as l}
                      <tr>
                        <td class="mono muted">{new Date(l.timestamp).toLocaleTimeString()}</td>
                        <td class="fw-600">{patientName(l.patientId)}</td>
                        <td>{medName(l.medicationId)}</td>
                        <td class:cell-error={l.errorTypes.length > 0}>
                          {l.errorTypes.length ? l.errorTypes.join(", ") : "—"}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>

      <!-- ── COMPLIANCE ── -->
      {:else if activeTab === "compliance"}
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-label">Total Scans</span>
            <span class="stat-val">{totalScans}</span>
          </div>
          <div class="stat-card stat-green">
            <span class="stat-label">Clean Scans</span>
            <span class="stat-val">{totalScans - errorScans}</span>
          </div>
          <div class="stat-card stat-red">
            <span class="stat-label">Error Scans</span>
            <span class="stat-val">{errorScans}</span>
          </div>
          <div class="stat-card" class:stat-red={errorAlert} class:stat-green={!errorAlert}>
            <span class="stat-label">Error Rate</span>
            <span class="stat-val">{errorRate}%</span>
          </div>
        </div>

        <div class="two-col">
          <div class="panel">
            <div class="panel-head">
              <h2>Errors by Type</h2>
              <p>Breakdown of medication right violations detected during scanning.</p>
            </div>
            {#if Object.keys(errorsByType).length === 0}
              <div class="empty-state">
                <div class="empty-icon">✓</div>
                <p class="empty-title">No errors recorded</p>
                <p class="empty-sub">All scans have been clean.</p>
              </div>
            {:else}
              <div class="error-breakdown">
                {#each Object.entries(errorsByType).sort((a,b) => b[1]-a[1]) as [type, count]}
                  {@const pct = Math.round((count/errorScans)*100)}
                  <div class="error-row">
                    <div class="error-meta">
                      <span class="error-type">{type}</span>
                      <span class="error-count">{count} <span class="error-pct">({pct}%)</span></span>
                    </div>
                    <div class="error-bar-bg">
                      <div class="error-bar" style="width:{pct}%"></div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2>Full Scan Log</h2>
              <p>All {totalScans} administration events.</p>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Nurse</th>
                    <th>Patient</th>
                    <th>Medication</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {#each logs as l}
                    <tr>
                      <td class="mono muted">{new Date(l.timestamp).toLocaleString()}</td>
                      <td class="mono">{l.nurseId}</td>
                      <td class="fw-600">{patientName(l.patientId)}</td>
                      <td>{medName(l.medicationId)}</td>
                      <td class:cell-error={l.errorTypes.length > 0}>{l.errorTypes.length ? l.errorTypes.join(", ") : "—"}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      <!-- ── ALERTS ── -->
      {:else if activeTab === "alerts"}
        <div class="panel">
          <div class="panel-head">
            <h2>Escalation Alerts</h2>
            <p>Active alerts based on configured thresholds. Update thresholds in the Admin dashboard.</p>
          </div>

          <div class="alerts-list">
            <div class="alert-card" class:ac-active={errorAlert} class:ac-ok={!errorAlert}>
              <div class="ac-icon-wrap" class:ac-icon-err={errorAlert} class:ac-icon-ok={!errorAlert}>
                {errorAlert ? "⚠" : "✓"}
              </div>
              <div class="ac-body">
                <p class="ac-title">Error Rate Threshold</p>
                <p class="ac-desc">Current rate: <strong>{errorRate}%</strong> · Threshold: <strong>{errorThreshold}%</strong></p>
                {#if errorAlert}
                  <p class="ac-action">Action required: Review error types in the Compliance tab and notify relevant staff.</p>
                {:else}
                  <p class="ac-ok">Within acceptable range.</p>
                {/if}
              </div>
              <span class="ac-badge" class:ac-badge-err={errorAlert} class:ac-badge-ok={!errorAlert}>
                {errorAlert ? "Alert" : "OK"}
              </span>
            </div>

            <div class="alert-card" class:ac-active={overdueOrders.length > 0} class:ac-ok={overdueOrders.length === 0}>
              <div class="ac-icon-wrap" class:ac-icon-err={overdueOrders.length > 0} class:ac-icon-ok={overdueOrders.length === 0}>
                {overdueOrders.length > 0 ? "⏰" : "✓"}
              </div>
              <div class="ac-body">
                <p class="ac-title">Overdue Medications</p>
                <p class="ac-desc">
                  {overdueOrders.length} overdue · Threshold: {thresholds.find(t=>t.metric==="overdue_minutes")?.thresholdValue ?? 30} min past scheduled time
                </p>
                {#if overdueOrders.length > 0}
                  <div class="overdue-list">
                    {#each overdueOrders as o}
                      <div class="overdue-item">
                        <span class="fw-600">{patientName(o.patientId)}</span>
                        <span class="muted">→ {medName(o.medicationId)} at {o.scheduledTime}</span>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="ac-ok">No overdue orders at this time.</p>
                {/if}
              </div>
              <span class="ac-badge" class:ac-badge-err={overdueOrders.length > 0} class:ac-badge-ok={overdueOrders.length === 0}>
                {overdueOrders.length > 0 ? "Alert" : "OK"}
              </span>
            </div>
          </div>

          {#if thresholds.length > 0}
            <div class="thresholds-note">
              <p class="tn-title">Configured Thresholds</p>
              <div class="tn-list">
                {#each thresholds as t}
                  <div class="tn-row">
                    <span class="tn-metric">{t.metric.replace(/_/g, " ")}</span>
                    <span class="tn-val">{t.thresholdValue}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
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
  .brand-logo { width:36px; height:36px; border-radius:10px; background:rgba(234,88,12,0.18); border:1px solid rgba(234,88,12,0.35); display:grid; place-items:center; font-size:16px; color:#fb923c; flex-shrink:0; }
  .brand-app { font-size:13px; font-weight:800; color:#fff; }
  .brand-role { font-size:11px; color:#ea580c; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-top:1px; }
  nav { padding:12px 10px; flex:1; display:flex; flex-direction:column; gap:2px; }
  .nav-item { display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; padding:9px 12px; border-radius:8px; background:none; border:none; color:#94a3b8; font-size:13px; font-weight:600; cursor:pointer; transition:background 0.12s,color 0.12s; }
  .nav-item:hover { background:rgba(255,255,255,0.06); color:#e2e8f0; }
  .nav-item.active { background:rgba(234,88,12,0.14); color:#fb923c; }
  .nav-badge { background:#ea580c; color:#fff; font-size:10px; font-weight:800; border-radius:999px; padding:1px 7px; min-width:18px; text-align:center; }
  .sidebar-footer { padding:16px 20px; border-top:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; gap:10px; }
  .user-row { display:flex; align-items:center; gap:10px; }
  .user-avatar { width:32px; height:32px; border-radius:50%; background:rgba(234,88,12,0.18); border:1px solid rgba(234,88,12,0.35); display:grid; place-items:center; font-size:13px; font-weight:800; color:#fb923c; text-transform:uppercase; flex-shrink:0; }
  .user-name { font-size:13px; font-weight:600; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .btn-signout { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#94a3b8; font-size:12px; font-weight:600; padding:7px 12px; cursor:pointer; transition:background 0.12s; text-align:left; width:100%; }
  .btn-signout:hover { background:rgba(255,255,255,0.1); color:#e2e8f0; }

  /* ── Main ── */
  .main-wrap { flex:1; display:flex; flex-direction:column; min-width:0; }
  .page-header { background:#fff; border-bottom:1px solid #e2e8f0; padding:20px 28px; display:flex; justify-content:space-between; align-items:center; gap:24px; flex-wrap:wrap; }
  .page-eyebrow { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#ea580c; margin-bottom:4px; }
  .page-title { font-size:22px; font-weight:800; color:#0f172a; }
  .header-stats { display:flex; gap:24px; }
  .hstat { display:flex; flex-direction:column; align-items:center; gap:2px; }
  .hstat-val { font-size:20px; font-weight:800; color:#0f172a; line-height:1; }
  .hstat-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; }
  .hstat-warn .hstat-val { color:#d97706; }
  .hstat-err .hstat-val  { color:#dc2626; }

  .content { padding:24px 28px; display:flex; flex-direction:column; gap:16px; }

  /* ── Alert banners ── */
  .alert-banner { display:flex; align-items:flex-start; gap:12px; border:1px solid; border-radius:12px; padding:14px 16px; font-size:13px; }
  .alert-error { background:#fef2f2; border-color:#fecaca; color:#991b1b; }
  .alert-warn  { background:#fffbeb; border-color:#fde68a; color:#92400e; }
  .banner-icon { font-size:16px; flex-shrink:0; margin-top:1px; }
  .banner-action { margin-left:6px; font-style:italic; opacity:0.8; }

  /* ── Stat cards (compliance tab) ── */
  .stats-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .stat-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:16px 18px; box-shadow:0 1px 4px rgba(15,23,42,0.05); display:flex; flex-direction:column; gap:6px; }
  .stat-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; }
  .stat-val { font-size:28px; font-weight:800; color:#0f172a; line-height:1; }
  .stat-green .stat-val { color:#16a34a; }
  .stat-red .stat-val   { color:#dc2626; }

  /* ── Panel ── */
  .two-col { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media(max-width:960px) { .two-col { grid-template-columns:1fr; } }
  .panel { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 1px 4px rgba(15,23,42,0.05); display:flex; flex-direction:column; gap:16px; }
  .panel-head h2 { font-size:17px; font-weight:800; color:#0f172a; }
  .panel-head p  { font-size:13px; color:#64748b; margin-top:4px; line-height:1.5; }

  /* ── Empty ── */
  .empty-state { text-align:center; padding:40px 24px; display:flex; flex-direction:column; align-items:center; gap:8px; }
  .empty-icon { width:48px; height:48px; border-radius:50%; background:#f0fdf4; border:2px solid #bbf7d0; display:grid; place-items:center; font-size:20px; color:#16a34a; }
  .empty-title { font-size:14px; font-weight:700; color:#0f172a; }
  .empty-sub { font-size:12px; color:#64748b; }

  /* ── Table ── */
  .table-wrap { overflow:auto; border:1px solid #e2e8f0; border-radius:10px; }
  table { width:100%; border-collapse:collapse; }
  thead tr { background:#fff8f4; }
  th { padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; white-space:nowrap; }
  td { padding:9px 12px; border-bottom:1px solid #f1f5f9; font-size:13px; color:#334155; }
  tbody tr:last-child td { border-bottom:none; }
  tbody tr:hover { background:#fafafa; }
  tr.row-overdue { background:#fffbeb; }
  .cell-error { color:#dc2626; font-weight:600; }
  .fw-600 { font-weight:600; color:#0f172a; }
  .mono { font-family:"SF Mono","Fira Code",monospace; font-size:12px; }
  .muted { color:#94a3b8; }

  /* ── Badges ── */
  .badge { font-size:10px; font-weight:700; border-radius:6px; padding:3px 8px; border:1px solid; }
  .badge-overdue { background:#fffbeb; color:#92400e; border-color:#fde68a; }
  .badge-pending { background:#f1f5f9; color:#64748b; border-color:#cbd5e1; }

  /* ── Error breakdown ── */
  .error-breakdown { display:flex; flex-direction:column; gap:12px; }
  .error-row { display:flex; flex-direction:column; gap:6px; }
  .error-meta { display:flex; justify-content:space-between; align-items:center; }
  .error-type { font-size:13px; font-weight:600; color:#0f172a; }
  .error-count { font-size:13px; font-weight:700; color:#dc2626; }
  .error-pct { font-size:11px; font-weight:500; color:#94a3b8; }
  .error-bar-bg { background:#f1f5f9; border-radius:999px; height:8px; overflow:hidden; }
  .error-bar { background:linear-gradient(90deg,#f97316,#ea580c); height:100%; border-radius:999px; transition:width 0.4s ease; }

  /* ── Alert cards ── */
  .alerts-list { display:flex; flex-direction:column; gap:12px; }
  .alert-card { display:flex; align-items:flex-start; gap:14px; border:1px solid; border-radius:14px; padding:18px; }
  .ac-active { border-color:#fecaca; background:#fef2f2; }
  .ac-ok     { border-color:#bbf7d0; background:#f0fdf4; }
  .ac-icon-wrap { width:40px; height:40px; border-radius:10px; display:grid; place-items:center; font-size:18px; flex-shrink:0; }
  .ac-icon-err { background:#fee2e2; color:#dc2626; }
  .ac-icon-ok  { background:#dcfce7; color:#16a34a; }
  .ac-body { flex:1; display:flex; flex-direction:column; gap:5px; }
  .ac-title { font-size:15px; font-weight:800; color:#0f172a; }
  .ac-desc  { font-size:13px; color:#334155; }
  .ac-action { font-size:12px; color:#991b1b; font-style:italic; }
  .ac-ok    { font-size:12px; color:#166534; font-style:italic; }
  .ac-badge { font-size:11px; font-weight:700; border-radius:6px; padding:4px 10px; border:1px solid; flex-shrink:0; align-self:flex-start; }
  .ac-badge-err { background:#fee2e2; color:#991b1b; border-color:#fecaca; }
  .ac-badge-ok  { background:#dcfce7; color:#166534; border-color:#bbf7d0; }

  .overdue-list { display:flex; flex-direction:column; gap:4px; margin-top:4px; }
  .overdue-item { font-size:12px; color:#92400e; display:flex; gap:8px; align-items:center; }

  /* ── Thresholds note ── */
  .thresholds-note { background:#fff8f4; border:1px solid #fed7aa; border-radius:12px; padding:16px; }
  .tn-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#ea580c; margin-bottom:10px; }
  .tn-list { display:flex; flex-direction:column; gap:6px; }
  .tn-row { display:flex; justify-content:space-between; align-items:center; }
  .tn-metric { font-size:13px; color:#334155; text-transform:capitalize; }
  .tn-val { font-size:13px; font-weight:700; color:#0f172a; font-family:"SF Mono","Fira Code",monospace; }
</style>
