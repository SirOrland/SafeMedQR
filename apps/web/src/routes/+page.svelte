<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { login } from "$lib/api";
  import { session, ROLE_ROUTES } from "$lib/session";

  let loginId = "";
  let loginPassword = "";
  let loginError = "";
  let loading = false;

  onMount(() => {
    const s = $session;
    if (s) goto(ROLE_ROUTES[s.user.role]);
  });

  async function onLogin() {
    loginError = "";
    loading = true;
    try {
      const res = await login(loginId, loginPassword);
      session.set({ token: res.token, user: res.user });
      await goto(ROLE_ROUTES[res.user.role]);
    } catch (e: unknown) {
      loginError = e instanceof Error ? e.message : "Login failed";
    } finally {
      loading = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") onLogin();
  }
</script>

<svelte:head><title>SafeMedsQR — Sign In</title></svelte:head>
<svelte:window on:keydown={onKey} />

<div class="root">
  <!-- Left branding panel -->
  <div class="brand-panel">
    <div class="brand-inner">
      <div class="brand-logo-wrap">
        <div class="brand-logo">✚</div>
      </div>
      <h1 class="brand-name">SafeMedsQR</h1>
      <p class="brand-tagline">Medication Safety Platform</p>

      <ul class="feature-list">
        <li><span class="feat-check">✓</span> 14 Rights Verification</li>
        <li><span class="feat-check">✓</span> QR-Based Patient Identification</li>
        <li><span class="feat-check">✓</span> Offline-Capable Logging</li>
        <li><span class="feat-check">✓</span> Real-Time Compliance Monitoring</li>
      </ul>

      <div class="role-pills-wrap">
        <p class="pills-label">Access for</p>
        <div class="role-pills">
          <span class="pill admin">Admin</span>
          <span class="pill doctor">Doctor</span>
          <span class="pill pharma">Pharmacist</span>
          <span class="pill super">Supervisor</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Right form panel -->
  <div class="form-panel">
    <div class="form-card">
      <div class="form-header">
        <p class="eyebrow">Clinical Portal</p>
        <h2>Welcome back</h2>
        <p class="subtitle">Sign in with your staff credentials. Your role determines which dashboard you see.</p>
      </div>

      <div class="fields">
        <label class="field">
          <span>Staff ID</span>
          <input bind:value={loginId} placeholder="e.g. a-900, d-001" autocomplete="username" />
        </label>
        <label class="field">
          <span>Password</span>
          <input bind:value={loginPassword} type="password" placeholder="••••••••" autocomplete="current-password" />
        </label>
      </div>

      {#if loginError}
        <p class="error-banner">⚠ {loginError}</p>
      {/if}

      <button class="btn-primary" on:click={onLogin} disabled={loading}>
        {#if loading}
          <span class="spinner"></span> Signing in…
        {:else}
          Sign In →
        {/if}
      </button>

      <p class="help-text">Contact your administrator if you don't have an account.</p>
    </div>
  </div>
</div>

<style>
  :global(*) { box-sizing: border-box; margin: 0; }
  :global(body) {
    font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif;
    color: #0f172a;
    min-height: 100vh;
  }

  .root {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 100vh;
  }

  /* ── Brand panel ── */
  .brand-panel {
    background: linear-gradient(160deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
  }
  .brand-inner {
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .brand-logo-wrap {
    display: flex;
  }
  .brand-logo {
    width: 64px; height: 64px;
    background: rgba(255,255,255,0.12);
    border: 1.5px solid rgba(255,255,255,0.25);
    border-radius: 18px;
    display: grid;
    place-items: center;
    font-size: 28px;
    color: #93c5fd;
  }
  .brand-name { font-size: 32px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
  .brand-tagline { font-size: 15px; color: rgba(255,255,255,0.6); margin-top: -16px; }

  .feature-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0;
  }
  .feature-list li {
    font-size: 14px;
    color: rgba(255,255,255,0.8);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .feat-check {
    width: 20px; height: 20px;
    background: rgba(99,202,136,0.2);
    border: 1px solid rgba(99,202,136,0.4);
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 11px;
    color: #86efac;
    flex-shrink: 0;
  }

  .role-pills-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .pills-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); }
  .role-pills { display: flex; gap: 6px; flex-wrap: wrap; }
  .pill {
    font-size: 11px; font-weight: 700; border-radius: 999px;
    padding: 4px 11px; border: 1px solid;
  }
  .pill.admin   { background: rgba(59,130,246,0.15); color: #93c5fd; border-color: rgba(59,130,246,0.3); }
  .pill.doctor  { background: rgba(34,197,94,0.12);  color: #86efac; border-color: rgba(34,197,94,0.25); }
  .pill.pharma  { background: rgba(168,85,247,0.15); color: #d8b4fe; border-color: rgba(168,85,247,0.3); }
  .pill.super   { background: rgba(249,115,22,0.15); color: #fdba74; border-color: rgba(249,115,22,0.3); }

  /* ── Form panel ── */
  .form-panel {
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
  }
  .form-card {
    width: min(420px, 100%);
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    padding: 36px 32px;
    box-shadow: 0 4px 24px rgba(15,23,42,0.08);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .form-header { display: flex; flex-direction: column; gap: 6px; }
  .eyebrow {
    font-size: 11px; font-weight: 800;
    letter-spacing: 0.1em; text-transform: uppercase; color: #2563eb;
  }
  h2 { font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1.2; }
  .subtitle { font-size: 14px; color: #64748b; line-height: 1.55; }

  .fields { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field span {
    font-size: 12px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em; color: #374151;
  }
  input {
    border: 1.5px solid #e2e8f0; border-radius: 10px;
    padding: 11px 14px; font-size: 14px; color: #0f172a; background: #fff;
    transition: border-color 0.15s, box-shadow 0.15s; width: 100%;
  }
  input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
  input::placeholder { color: #94a3b8; }

  .error-banner {
    background: #fef2f2; color: #b91c1c;
    border: 1px solid #fecaca; border-radius: 10px;
    padding: 10px 14px; font-size: 13px; font-weight: 600;
  }

  .btn-primary {
    width: 100%; padding: 13px;
    background: #1d4ed8;
    color: #fff; border: none; border-radius: 10px;
    font-weight: 700; font-size: 15px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background 0.15s, transform 0.06s, box-shadow 0.15s;
    box-shadow: 0 2px 8px rgba(29,78,216,0.3);
  }
  .btn-primary:hover:not(:disabled) { background: #1e40af; box-shadow: 0 4px 12px rgba(29,78,216,0.35); }
  .btn-primary:active { transform: translateY(1px); }
  .btn-primary:disabled { opacity: 0.6; cursor: default; box-shadow: none; }

  .spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .help-text { font-size: 12px; color: #94a3b8; text-align: center; }

  @media (max-width: 768px) {
    .root { grid-template-columns: 1fr; }
    .brand-panel { display: none; }
    .form-panel { padding: 32px 20px; background: #fff; }
    .form-card { box-shadow: none; border: none; padding: 0; }
  }
</style>
