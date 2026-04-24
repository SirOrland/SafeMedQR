import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

const STATUSBAR_H = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0;
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  createScanLog,
  getMedications,
  getMyLogs,
  getOrders,
  getPatient,
  nurseLogin,
  submitPostEval,
} from "./src/api";
import {
  clearAllLocalData,
  enqueuePendingLog,
  getPendingLogs,
  loadCache,
  removePendingLogs,
  saveCache,
} from "./src/storage";
import type {
  AutoRightKey,
  ManualRightKey,
  MedAlertStatus,
  Medication,
  MedicationOrder,
  NurseSession,
  Patient,
  ScanLog,
} from "./src/types";

// ── Constants ─────────────────────────────────────────────────────────────────

type Screen =
  | "login"
  | "home"
  | "scanPatient"
  | "patientProfile"
  | "verify"
  | "postEval"
  | "success"
  | "logs";

type RightStatus = "green" | "yellow" | "red";

const { width: SCREEN_W } = Dimensions.get("window");

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const DUE_SOON_MINS = 30;

const C = {
  primary:       "#1d4ed8",
  primaryDark:   "#1e3a8a",
  primaryLight:  "#eff6ff",
  primaryBorder: "#bfdbfe",
  success:       "#059669",
  successLight:  "#ecfdf5",
  successBorder: "#6ee7b7",
  warning:       "#d97706",
  warningLight:  "#fffbeb",
  warningBorder: "#fde68a",
  danger:        "#dc2626",
  dangerLight:   "#fff1f2",
  dangerBorder:  "#fecaca",
  bg:            "#f1f5f9",
  surface:       "#ffffff",
  border:        "#e2e8f0",
  borderDark:    "#cbd5e1",
  text:          "#0f172a",
  textSub:       "#475569",
  textMuted:     "#94a3b8",
  overlay:       "rgba(15,23,42,0.45)",
};

const AUTO_RIGHT_LABELS: Record<AutoRightKey, string> = {
  rightPatient:        "Right Patient",
  rightDrug:           "Right Drug",
  rightDose:           "Right Dose",
  rightRoute:          "Right Route",
  rightTime:           "Right Time",
  rightPrescription:   "Right Prescription",
  rightNurseClinician: "Right Nurse Clinician",
  rightDocumentation:  "Right Documentation",
};

const MANUAL_RIGHT_LABELS: Record<ManualRightKey, string> = {
  rightAssessment:      "Right Assessment",
  rightEducation:       "Right Education",
  rightApproach:        "Right Approach",
  rightPrincipleOfCare: "Right Principle of Care",
  rightEvaluation:      "Right Evaluation",
  rightToRefuse:        "Right to Refuse",
};

const AUTO_KEYS   = Object.keys(AUTO_RIGHT_LABELS)   as AutoRightKey[];
const MANUAL_KEYS = Object.keys(MANUAL_RIGHT_LABELS) as ManualRightKey[];

const BLANK_MANUAL: Record<ManualRightKey, boolean> = {
  rightAssessment: false, rightEducation: false, rightApproach: false,
  rightPrincipleOfCare: false, rightEvaluation: false, rightToRefuse: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getMedAlertStatus(scheduledTime: string): MedAlertStatus {
  const [h, m] = scheduledTime.split(":").map(Number);
  const scheduled = new Date();
  scheduled.setHours(h, m, 0, 0);
  const diffMins = (scheduled.getTime() - Date.now()) / 60000;
  if (diffMins < 0)              return "overdue";
  if (diffMins <= DUE_SOON_MINS) return "due-soon";
  return "on-time";
}

function alertColor(s: MedAlertStatus) {
  return s === "overdue" ? C.danger : s === "due-soon" ? C.warning : C.success;
}
function alertBg(s: MedAlertStatus) {
  return s === "overdue" ? C.dangerLight : s === "due-soon" ? C.warningLight : C.successLight;
}
function alertBorder(s: MedAlertStatus) {
  return s === "overdue" ? C.dangerBorder : s === "due-soon" ? C.warningBorder : C.successBorder;
}
function alertDot(s: MedAlertStatus) {
  return s === "overdue" ? "🔴" : s === "due-soon" ? "🟡" : "🟢";
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("");
}

// ── Shared UI components ──────────────────────────────────────────────────────

function ScreenHeader({
  title,
  left,
  right,
  badge,
}: {
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  badge?: string;
}) {
  return (
    <View style={sh.header}>
      <View style={sh.headerLeft}>{left}</View>
      {title ? <Text style={sh.headerTitle} numberOfLines={1}>{title}</Text> : <View style={{ flex: 1 }} />}
      <View style={sh.headerRight}>
        {badge ? (
          <View style={sh.stepBadge}><Text style={sh.stepText}>{badge}</Text></View>
        ) : right}
      </View>
    </View>
  );
}

function BackBtn({ onPress, label = "Back" }: { onPress: () => void; label?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={sh.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Text style={sh.backBtnText}>‹ {label}</Text>
    </TouchableOpacity>
  );
}

const sh = StyleSheet.create({
  header:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  headerLeft:  { width: 80 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: C.text },
  headerRight: { width: 80, alignItems: "flex-end" },
  backBtn:     { padding: 4 },
  backBtnText: { fontSize: 17, fontWeight: "600", color: C.primary },
  stepBadge:   { backgroundColor: C.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.primaryBorder },
  stepText:    { fontSize: 10, fontWeight: "800", color: C.primaryDark, letterSpacing: 0.5 },
});

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [permission, requestPermission] = useCameraPermissions();

  const [session, setSession]     = useState<NurseSession | null>(null);
  const timeoutRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [orders, setOrders]       = useState<MedicationOrder[]>([]);
  const [meds, setMeds]           = useState<Medication[]>([]);
  const [shiftLogs, setShiftLogs] = useState<ScanLog[]>([]);

  const [patient, setPatient]     = useState<Patient | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<MedicationOrder | null>(null);
  const [autoErrors, setAutoErrors]       = useState<string[]>([]);
  const [manualConfirm, setManualConfirm] = useState<Record<ManualRightKey, boolean>>(BLANK_MANUAL);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const [nurseIdInput, setNurseIdInput]   = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginLoading, setLoginLoading]   = useState(false);

  const [adverseReaction, setAdverseReaction] = useState<boolean | null>(null);
  const [evalNotes, setEvalNotes]             = useState("");

  // ── Session timeout ─────────────────────────────────────────────────────────

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (session) {
      timeoutRef.current = setTimeout(() => {
        Alert.alert("Session Expired", "You have been logged out due to inactivity.");
        handleSignOut();
      }, SESSION_TIMEOUT_MS);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    resetTimeout();
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [resetTimeout]);

  // ── Data loading & offline ──────────────────────────────────────────────────

  async function loadReferenceData(nurseId: string) {
    try {
      const [o, m, logs] = await Promise.all([getOrders(), getMedications(), getMyLogs(nurseId)]);
      const activeOrders = o.filter((x) => x.active);
      setOrders(activeOrders);
      setMeds(m);
      setShiftLogs(logs);
      await saveCache({ orders: activeOrders, medications: m, cachedAt: new Date().toISOString() });
      setIsOffline(false);

      const pending = await getPendingLogs();
      if (pending.length > 0) {
        const synced: string[] = [];
        for (const p of pending) {
          try {
            await createScanLog({ nurseId: p.nurseId, patientId: p.patientId, medicationId: p.medicationId, orderId: p.orderId, errorTypes: p.errorTypes });
            synced.push(p.localId);
          } catch { /* keep for next sync */ }
        }
        if (synced.length > 0) {
          await removePendingLogs(synced);
          Alert.alert("Sync Complete", `${synced.length} offline record(s) synced.`);
        }
      }
    } catch {
      const cache = await loadCache();
      if (cache) { setOrders(cache.orders); setMeds(cache.medications); setIsOffline(true); }
    }
  }

  // ── Login / logout ──────────────────────────────────────────────────────────

  async function handleLogin() {
    if (!nurseIdInput.trim() || !passwordInput.trim()) {
      Alert.alert("Error", "Please enter your ID and password.");
      return;
    }
    setLoginLoading(true);
    try {
      const result = await nurseLogin(nurseIdInput.trim(), passwordInput);
      if (result.user.role !== "nurse") {
        Alert.alert("Access Denied", "This app is for nurses only.");
        return;
      }
      const s: NurseSession = { nurseId: result.user.id, nurseName: result.user.name };
      setSession(s);
      await loadReferenceData(result.user.id);
      setScreen("home");
    } catch (e: unknown) {
      Alert.alert("Login Failed", e instanceof Error ? e.message : "Invalid credentials.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleSignOut() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setSession(null);
    setScreen("login");
    setNurseIdInput("");
    setPasswordInput("");
    resetScanFlow();
    await clearAllLocalData();
  }

  // ── Scan flow ───────────────────────────────────────────────────────────────

  function resetScanFlow() {
    setPatient(null);
    setSelectedOrder(null);
    setAutoErrors([]);
    setManualConfirm(BLANK_MANUAL);
    setLastLogId(null);
    setAdverseReaction(null);
    setEvalNotes("");
  }

  async function onPatientScanned(scannedId: string) {
    resetTimeout();
    try {
      const p = await getPatient(scannedId);
      setPatient(p);
      setScreen("patientProfile");
    } catch {
      const hasPatient = orders.some((o) => o.patientId === scannedId);
      if (hasPatient) {
        setPatient({ id: scannedId, mrn: "—", name: "Patient (offline)", dob: "—", ward: "—", bed: null, allergyStatus: "none", allergies: null, patientStatus: "active", attendingPhysicianId: null, admissionDate: null });
        setScreen("patientProfile");
      } else {
        Alert.alert("Patient Not Found", "No patient record found for this QR code.");
      }
    }
  }

  function onSelectOrder(order: MedicationOrder) {
    resetTimeout();
    setSelectedOrder(order);
    const med = meds.find((m) => m.id === order.medicationId);
    const errors: string[] = [];

    if (order.patientId !== patient?.id)  errors.push("Right Patient");
    if (!med) {
      errors.push("Right Drug");
    } else {
      if (order.prescribedDose  !== med.dose)  errors.push("Right Dose");
      if (order.prescribedRoute !== med.route) errors.push("Right Route");
    }
    if (Math.abs(timeToMinutes(order.scheduledTime) - timeToMinutes(nowHHmm())) > DUE_SOON_MINS) errors.push("Right Time");
    if (!order.prescriptionId) errors.push("Right Prescription");

    setAutoErrors(errors);
    setManualConfirm(BLANK_MANUAL);
    setScreen("verify");
  }

  function timeToMinutes(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  async function confirmAdministration() {
    if (!session || !patient || !selectedOrder) return;
    resetTimeout();
    try {
      let logId: string | null = null;
      if (isOffline) {
        await enqueuePendingLog({
          nurseId: session.nurseId, patientId: patient.id,
          medicationId: selectedOrder.medicationId, orderId: selectedOrder.id,
          errorTypes: [], timestamp: new Date().toISOString(),
        });
      } else {
        const log = await createScanLog({
          nurseId: session.nurseId, patientId: patient.id,
          medicationId: selectedOrder.medicationId, orderId: selectedOrder.id,
          errorTypes: [],
        });
        logId = log.id;
        await loadReferenceData(session.nurseId);
      }
      setLastLogId(logId);
      setScreen("success");
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      Alert.alert("Error", `Failed to record administration.\n\n${detail}`);
    }
  }

  async function logUnsafeAttempt() {
    if (!session || !patient || !selectedOrder) return;
    try {
      await createScanLog({
        nurseId: session.nurseId, patientId: patient.id,
        medicationId: selectedOrder.medicationId, orderId: selectedOrder.id,
        errorTypes: autoErrors,
      });
    } catch { /* best-effort */ }
    resetScanFlow();
    setScreen("home");
  }

  async function submitEval() {
    if (!lastLogId || adverseReaction === null) return;
    try {
      await submitPostEval(lastLogId, adverseReaction, evalNotes || undefined);
    } catch { /* non-critical */ }
    resetScanFlow();
    setScreen("home");
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const patientOrders = useMemo(() => orders.filter((o) => o.patientId === patient?.id), [orders, patient]);

  const autoStatuses = useMemo((): Record<AutoRightKey, RightStatus> => {
    const failed = new Set(autoErrors);
    return {
      rightPatient:        failed.has("Right Patient")      ? "red" : "green",
      rightDrug:           failed.has("Right Drug")         ? "red" : "green",
      rightDose:           failed.has("Right Dose")         ? "red" : "green",
      rightRoute:          failed.has("Right Route")        ? "red" : "green",
      rightTime:           failed.has("Right Time")         ? "red" : "green",
      rightPrescription:   failed.has("Right Prescription") ? "red" : "green",
      rightNurseClinician: "green",
      rightDocumentation:  "green",
    };
  }, [autoErrors]);

  const manualStatuses = useMemo((): Record<ManualRightKey, RightStatus> => {
    const out = {} as Record<ManualRightKey, RightStatus>;
    for (const k of MANUAL_KEYS) out[k] = manualConfirm[k] ? "green" : "yellow";
    return out;
  }, [manualConfirm]);

  const hasAutoFail      = useMemo(() => Object.values(autoStatuses).some((v) => v === "red"),    [autoStatuses]);
  const hasPendingManual = useMemo(() => Object.values(manualStatuses).some((v) => v === "yellow"), [manualStatuses]);
  const canAdminister    = !hasAutoFail && !hasPendingManual;

  const allPendingOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const overdueCount  = useMemo(() => allPendingOrders.filter((o) => getMedAlertStatus(o.scheduledTime) === "overdue").length,  [allPendingOrders]);
  const dueSoonCount  = useMemo(() => allPendingOrders.filter((o) => getMedAlertStatus(o.scheduledTime) === "due-soon").length, [allPendingOrders]);
  const onTimeCount   = useMemo(() => allPendingOrders.filter((o) => getMedAlertStatus(o.scheduledTime) === "on-time").length,  [allPendingOrders]);

  const manualConfirmedCount = useMemo(() => MANUAL_KEYS.filter((k) => manualConfirm[k]).length, [manualConfirm]);

  const medName = (id: string) => meds.find((m) => m.id === id)?.name ?? id;

  function rightRowStyle(s: RightStatus) {
    if (s === "green")  return styles.rowGreen;
    if (s === "yellow") return styles.rowYellow;
    return styles.rowRed;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREENS
  // ─────────────────────────────────────────────────────────────────────────────

  // ── LOGIN ────────────────────────────────────────────────────────────────────
  if (screen === "login") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
            {/* Hero area */}
            <View style={styles.loginHero}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoIcon}>✚</Text>
              </View>
              <Text style={styles.logoAppName}>SafeMedsQR</Text>
              <Text style={styles.logoTagline}>Medication Safety Platform</Text>
            </View>

            {/* Card */}
            <View style={styles.loginCard}>
              <Text style={styles.loginCardTitle}>Nurse Sign In</Text>
              <Text style={styles.loginCardSub}>Staff nurses only. Your admin creates your account.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nurse ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. n-100"
                  placeholderTextColor={C.textMuted}
                  value={nurseIdInput}
                  onChangeText={setNurseIdInput}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, loginLoading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loginLoading}
                activeOpacity={0.85}
              >
                {loginLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Doctors, pharmacists, and admins use the web portal.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── HOME DASHBOARD ───────────────────────────────────────────────────────────
  if (screen === "home") {
    const now     = new Date();
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const initials = getInitials(session?.nurseName ?? "");

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />

        {/* Colored top header band */}
        <View style={styles.homeTopBar}>
          <View style={styles.homeTopBarLeft}>
            <Text style={styles.appBrand}>SafeMedsQR</Text>
            <Text style={styles.homeWelcome}>Good day, {session?.nurseName}</Text>
            <Text style={styles.homeDatetime}>{dateStr} · {timeStr}</Text>
          </View>
          <View style={styles.homeTopBarRight}>
            <View style={styles.nurseAvatar}>
              <Text style={styles.nurseAvatarText}>{initials}</Text>
            </View>
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.padded} onTouchStart={resetTimeout}>
          {isOffline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>⚠  Offline mode — using cached data. Logs will sync when connected.</Text>
            </View>
          )}

          {/* Alert summary */}
          <Text style={styles.sectionTitle}>Medication Alerts</Text>
          <View style={styles.alertRow}>
            {[
              { bg: C.dangerLight,  border: C.dangerBorder,  dot: "🔴", count: overdueCount,  label: "Overdue",  color: C.danger  },
              { bg: C.warningLight, border: C.warningBorder, dot: "🟡", count: dueSoonCount,  label: "Due Soon", color: C.warning },
              { bg: C.successLight, border: C.successBorder, dot: "🟢", count: onTimeCount,   label: "On Time",  color: C.success },
            ].map((item) => (
              <View key={item.label} style={[styles.alertCard, { backgroundColor: item.bg, borderColor: item.border }]}>
                <Text style={styles.alertDotIcon}>{item.dot}</Text>
                <Text style={[styles.alertCount, { color: item.color }]}>{item.count}</Text>
                <Text style={styles.alertLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* Pending orders */}
          {allPendingOrders.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Pending Orders</Text>
              {allPendingOrders.map((o) => {
                const st = getMedAlertStatus(o.scheduledTime);
                return (
                  <View key={o.id} style={[styles.pendingRow, { borderLeftColor: alertColor(st), backgroundColor: alertBg(st), borderColor: alertBorder(st) }]}>
                    <View style={styles.pendingRowInner}>
                      <Text style={styles.pendingMed}>{medName(o.medicationId)}</Text>
                      <View style={[styles.timePill, { backgroundColor: alertColor(st) }]}>
                        <Text style={styles.timePillText}>{o.scheduledTime}</Text>
                      </View>
                    </View>
                    <Text style={styles.pendingStatus}>{alertDot(st)}  {st === "overdue" ? "Overdue" : st === "due-soon" ? "Due soon" : "On time"}</Text>
                  </View>
                );
              })}
            </>
          )}

          {/* Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => { resetScanFlow(); setScreen("scanPatient"); }}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: C.primaryLight }]}>
              <Text style={styles.actionIconText}>📷</Text>
            </View>
            <View style={styles.actionCardBody}>
              <Text style={styles.actionCardTitle}>Scan Patient QR</Text>
              <Text style={styles.actionCardSub}>Verify and administer medication</Text>
            </View>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { marginTop: 10 }]}
            onPress={async () => { if (session) await loadReferenceData(session.nurseId); setScreen("logs"); }}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: "#f0fdf4" }]}>
              <Text style={styles.actionIconText}>📋</Text>
            </View>
            <View style={styles.actionCardBody}>
              <Text style={styles.actionCardTitle}>View Today's Logs</Text>
              <Text style={styles.actionCardSub}>{shiftLogs.length} record{shiftLogs.length !== 1 ? "s" : ""} this shift</Text>
            </View>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── SCAN PATIENT QR ──────────────────────────────────────────────────────────
  if (screen === "scanPatient") {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: C.text }]}>
        <StatusBar style="light" />
        <ScreenHeader
          title="Scan Patient"
          left={<BackBtn onPress={() => setScreen("home")} label="Home" />}
          badge="STEP 1 / 3"
        />

        <View style={styles.scanContainer} onTouchStart={resetTimeout}>
          {permission?.granted ? (
            <>
              <CameraView
                onBarcodeScanned={({ data }) => onPatientScanned(data)}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                style={StyleSheet.absoluteFillObject}
              />

              {/* Dimmed overlay with cutout effect */}
              <View style={styles.scanOverlayTop} />
              <View style={styles.scanOverlayRow}>
                <View style={styles.scanOverlaySide} />
                <View style={styles.scanFrameBox}>
                  {/* Corner markers */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <View style={styles.scanOverlaySide} />
              </View>
              <View style={styles.scanOverlayBottom}>
                <Text style={styles.scanHint}>Align the patient's QR wristband within the frame</Text>
              </View>
            </>
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionTitle}>Camera Access Required</Text>
              <Text style={styles.permissionSub}>Camera permission is needed to scan patient QR wristbands.</Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={requestPermission}>
                <Text style={styles.btnPrimaryText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── PATIENT PROFILE ──────────────────────────────────────────────────────────
  if (screen === "patientProfile" && patient) {
    const initials = getInitials(patient.name);
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScreenHeader
          title="Patient Profile"
          left={<BackBtn onPress={() => setScreen("scanPatient")} label="Re-scan" />}
          right={
            <TouchableOpacity onPress={() => setScreen("home")}>
              <Text style={sh.backBtnText}>Home</Text>
            </TouchableOpacity>
          }
          badge="STEP 2 / 3"
        />

        <ScrollView contentContainerStyle={styles.padded} onTouchStart={resetTimeout}>
          {/* Patient info card */}
          <View style={styles.patientCard}>
            <View style={styles.patientCardTop}>
              <View style={styles.patientAvatar}>
                <Text style={styles.patientAvatarText}>{initials}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.eyebrowBlue}>Patient Record</Text>
                <Text style={styles.patientName}>{patient.name}</Text>
                {/* Patient status badge */}
                {patient.patientStatus !== "active" && (
                  <View style={[
                    styles.patientStatusBadge,
                    patient.patientStatus === "discharged" ? styles.patientStatusDischarged : styles.patientStatusTransferred,
                  ]}>
                    <Text style={styles.patientStatusText}>
                      {patient.patientStatus === "discharged" ? "⚠  DISCHARGED" : "⚠  TRANSFERRED"}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.patientMetaRow}>
              {[
                { label: "MRN",  value: patient.mrn  },
                { label: "DOB",  value: patient.dob  },
                { label: "Ward", value: patient.ward + (patient.bed ? ` / ${patient.bed}` : "") },
                ...(patient.admissionDate ? [{ label: "Admitted", value: patient.admissionDate }] : []),
                ...(patient.attendingPhysicianId ? [{ label: "Physician", value: patient.attendingPhysicianId }] : []),
              ].map((item) => (
                <View key={item.label} style={styles.metaChip}>
                  <Text style={styles.metaChipLabel}>{item.label}</Text>
                  <Text style={styles.metaChipValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            {(patient.allergyStatus === "present" || patient.allergies) && (
              <View style={styles.allergyBanner}>
                <Text style={styles.allergyTitle}>⚠  ALLERGY ALERT</Text>
                <Text style={styles.allergyText}>{patient.allergies || "Allergy on record — verify before administering"}</Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Active Medication Orders</Text>
          <Text style={styles.sectionSub}>Tap a medication to begin the 14 Rights verification.</Text>

          {patientOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>💊</Text>
              <Text style={styles.emptyText}>No active orders found for this patient.</Text>
            </View>
          ) : (
            patientOrders.map((order) => {
              const med  = meds.find((m) => m.id === order.medicationId);
              const st   = getMedAlertStatus(order.scheduledTime);
              const done = order.status === "dispensed";
              return (
                <TouchableOpacity
                  key={order.id}
                  style={[styles.orderCard, { borderLeftColor: alertColor(st) }, done && styles.orderCardDim]}
                  onPress={() => !done && onSelectOrder(order)}
                  disabled={done}
                  activeOpacity={0.75}
                >
                  <View style={styles.orderCardTop}>
                    <Text style={styles.orderMedName} numberOfLines={1}>{alertDot(st)}  {med?.name ?? order.medicationId}</Text>
                    <View style={[styles.statusPill, {
                      backgroundColor: order.status === "dispensed" ? C.successLight : order.status === "verified" ? C.primaryLight : C.warningLight,
                    }]}>
                      <Text style={[styles.statusPillText, {
                        color: order.status === "dispensed" ? C.success : order.status === "verified" ? C.primary : C.warning,
                      }]}>{order.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.orderDetail}>Dose: {order.prescribedDose}  ·  Route: {order.prescribedRoute}</Text>
                  <Text style={styles.orderDetail}>Scheduled: {order.scheduledTime}  ·  Rx: {order.prescriptionId}</Text>
                  {done && <Text style={styles.dispensedNote}>Already dispensed — cannot re-administer</Text>}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 14 RIGHTS VERIFICATION ───────────────────────────────────────────────────
  if (screen === "verify" && selectedOrder) {
    const med = meds.find((m) => m.id === selectedOrder.medicationId);
    const totalRights   = AUTO_KEYS.length + MANUAL_KEYS.length;
    const passedAuto    = AUTO_KEYS.filter((k) => autoStatuses[k] === "green").length;
    const confirmedManual = manualConfirmedCount;
    const totalPassed   = passedAuto + confirmedManual;

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScreenHeader
          title="14 Rights Check"
          left={<BackBtn onPress={() => setScreen("patientProfile")} />}
          badge="STEP 3 / 3"
        />

        <ScrollView contentContainerStyle={styles.padded} onTouchStart={resetTimeout}>
          {/* Med summary card */}
          <View style={styles.verifyMedCard}>
            <Text style={styles.eyebrowBlue}>Medication</Text>
            <Text style={styles.verifyMedName}>{med?.name ?? selectedOrder.medicationId}</Text>
            <Text style={styles.verifyMedDetail}>{selectedOrder.prescribedDose} · {selectedOrder.prescribedRoute} · {selectedOrder.scheduledTime}</Text>
            <View style={styles.verifyPatientRow}>
              <Text style={styles.verifyPatientLabel}>Patient:</Text>
              <Text style={styles.verifyPatientName}>{patient?.name}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>{totalPassed} / {totalRights} rights satisfied</Text>
            <Text style={styles.progressPct}>{Math.round((totalPassed / totalRights) * 100)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {
              width: `${(totalPassed / totalRights) * 100}%` as any,
              backgroundColor: hasAutoFail ? C.danger : totalPassed === totalRights ? C.success : C.primary,
            }]} />
          </View>

          {hasAutoFail && (
            <View style={styles.blockBanner}>
              <Text style={styles.blockBannerText}>⛔  Administration blocked — critical right(s) failed</Text>
            </View>
          )}

          {/* Auto-verified rights */}
          <Text style={styles.sectionTitle}>System-Verified Rights</Text>
          {AUTO_KEYS.map((key) => (
            <View key={key} style={[styles.rightRow, rightRowStyle(autoStatuses[key])]}>
              <Text style={styles.rightLabel}>{AUTO_RIGHT_LABELS[key]}</Text>
              <View style={[styles.rightBadge, { backgroundColor: autoStatuses[key] === "green" ? C.success : C.danger }]}>
                <Text style={styles.rightBadgeText}>{autoStatuses[key] === "green" ? "✓ PASS" : "✗ FAIL"}</Text>
              </View>
            </View>
          ))}

          {/* Manual confirmation rights */}
          <Text style={styles.sectionTitle}>Nurse Confirmation</Text>
          <Text style={styles.sectionSub}>Tap each right to confirm you have assessed and satisfied it.</Text>
          {MANUAL_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.rightRow, rightRowStyle(manualStatuses[key])]}
              onPress={() => { resetTimeout(); setManualConfirm((s) => ({ ...s, [key]: !s[key] })); }}
              activeOpacity={0.7}
            >
              <Text style={styles.rightLabel}>{MANUAL_RIGHT_LABELS[key]}</Text>
              <View style={[styles.rightBadge, {
                backgroundColor: manualConfirm[key] ? C.success : "#cbd5e1",
              }]}>
                <Text style={styles.rightBadgeText}>{manualConfirm[key] ? "✓ DONE" : "PENDING"}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.adminBtn, (!canAdminister || hasAutoFail) && styles.btnDisabled]}
            disabled={!canAdminister || hasAutoFail}
            onPress={confirmAdministration}
            activeOpacity={0.85}
          >
            <Text style={styles.adminBtnText}>Administer Medication</Text>
          </TouchableOpacity>

          {!canAdminister && !hasAutoFail && (
            <Text style={styles.pendingNote}>Confirm all {MANUAL_KEYS.length - manualConfirmedCount} remaining manual right{MANUAL_KEYS.length - manualConfirmedCount !== 1 ? "s" : ""} above before administering.</Text>
          )}

          {hasAutoFail && (
            <TouchableOpacity style={styles.btnDanger} onPress={logUnsafeAttempt} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Log Unsafe Attempt &amp; Return</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── SUCCESS ──────────────────────────────────────────────────────────────────
  if (screen === "success") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.successScroll}>
          <View style={styles.successCircle}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Administration Recorded</Text>
          <Text style={styles.successSub}>
            {isOffline
              ? "Saved locally — will sync when internet is restored."
              : "Administration has been logged and synced to the system."}
          </Text>
          <Text style={styles.successTimestamp}>{new Date().toLocaleTimeString()}</Text>

          <View style={styles.successActions}>
            {lastLogId && (
              <TouchableOpacity style={styles.btnPrimary} onPress={() => setScreen("postEval")} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>Record Post-Evaluation</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btnSecondary, { marginTop: 10 }]}
              onPress={() => { resetScanFlow(); setScreen("home"); }}
              activeOpacity={0.8}
            >
              <Text style={styles.btnSecondaryText}>Return to Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── POST-ADMINISTRATION EVALUATION ───────────────────────────────────────────
  if (screen === "postEval") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScreenHeader
          title="Post-Evaluation"
          left={<BackBtn onPress={() => setScreen("success")} />}
        />

        <ScrollView contentContainerStyle={styles.padded} onTouchStart={resetTimeout}>
          <Text style={styles.pageTitle}>Patient Evaluation</Text>
          <Text style={styles.pageSub}>Right Evaluation: Record the patient's response to the medication.</Text>

          <Text style={styles.sectionTitle}>Adverse Reaction?</Text>
          <View style={styles.yesNoRow}>
            <TouchableOpacity
              style={[styles.yesNoBtn, adverseReaction === true && styles.yesNoBtnDanger]}
              onPress={() => setAdverseReaction(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.yesNoBtnText, adverseReaction === true && { color: C.danger }]}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.yesNoBtn, adverseReaction === false && styles.yesNoBtnSuccess]}
              onPress={() => setAdverseReaction(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.yesNoBtnText, adverseReaction === false && { color: C.success }]}>No</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Notes <Text style={styles.optionalTag}>(optional)</Text></Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Patient response, observations, or concerns…"
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={4}
            value={evalNotes}
            onChangeText={setEvalNotes}
          />

          <TouchableOpacity
            style={[styles.btnPrimary, adverseReaction === null && styles.btnDisabled]}
            disabled={adverseReaction === null}
            onPress={submitEval}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>Submit Evaluation</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnSecondary, { marginTop: 10 }]}
            onPress={() => { resetScanFlow(); setScreen("home"); }}
            activeOpacity={0.8}
          >
            <Text style={styles.btnSecondaryText}>Skip &amp; Return Home</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── LOGS ─────────────────────────────────────────────────────────────────────
  if (screen === "logs") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScreenHeader
          title="Today's Logs"
          left={<BackBtn onPress={() => setScreen("home")} label="Home" />}
          right={<Text style={styles.readOnlyTag}>READ ONLY</Text>}
        />

        <ScrollView contentContainerStyle={styles.padded} onTouchStart={resetTimeout}>
          <Text style={styles.pageSub}>Your medication administration records for this shift. These cannot be edited.</Text>

          {shiftLogs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No administrations recorded yet today.</Text>
            </View>
          ) : (
            shiftLogs.map((log) => (
              <View key={log.id} style={[styles.logCard, log.errorTypes.length > 0 && styles.logCardError]}>
                <View style={styles.logCardTop}>
                  <Text style={styles.logMed} numberOfLines={1}>{medName(log.medicationId)}</Text>
                  {log.errorTypes.length > 0
                    ? <View style={styles.logErrBadge}><Text style={styles.logErrText}>⚠ Errors</Text></View>
                    : <View style={styles.logOkBadge}><Text style={styles.logOkText}>✓ OK</Text></View>
                  }
                </View>
                <Text style={styles.logMeta}>Patient: {log.patientId}</Text>
                <Text style={styles.logMeta}>Time: {new Date(log.timestamp).toLocaleTimeString()}</Text>
                {log.errorTypes.length > 0 && (
                  <Text style={styles.logErrors}>{log.errorTypes.join("  ·  ")}</Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FRAME_SIZE = SCREEN_W * 0.62;
const CORNER_LEN = 24;
const CORNER_W   = 3;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: STATUSBAR_H },

  // ── Login ──────────────────────────────────────────────────────────────────
  loginScroll: { flexGrow: 1, backgroundColor: C.primaryDark },

  loginHero: { alignItems: "center", paddingTop: 56, paddingBottom: 40 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.3)",
    marginBottom: 16,
  },
  logoIcon:    { fontSize: 36, color: "#fff" },
  logoAppName: { fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  logoTagline: { fontSize: 14, color: "rgba(255,255,255,0.65)", marginTop: 4 },

  loginCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingBottom: 40, gap: 6,
    flex: 1, minHeight: 420,
  },
  loginCardTitle: { fontSize: 22, fontWeight: "800", color: C.text, marginBottom: 2 },
  loginCardSub:   { fontSize: 14, color: C.textSub, marginBottom: 8, lineHeight: 20 },
  fieldGroup:     { gap: 6, marginBottom: 4 },

  // ── Home ───────────────────────────────────────────────────────────────────
  homeTopBar: {
    backgroundColor: C.primaryDark,
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 20,
    justifyContent: "space-between",
  },
  homeTopBarLeft:  { flex: 1 },
  homeTopBarRight: { alignItems: "flex-end", gap: 10 },
  appBrand:        { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.55)", letterSpacing: 1.5, textTransform: "uppercase" },
  homeWelcome:     { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 4, lineHeight: 28 },
  homeDatetime:    { fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 3 },
  nurseAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)",
  },
  nurseAvatarText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  signOutBtn:  { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  signOutText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.85)" },

  alertRow:    { flexDirection: "row", gap: 10, marginBottom: 4 },
  alertCard:   { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14, alignItems: "center", gap: 4 },
  alertDotIcon: { fontSize: 20 },
  alertCount:  { fontSize: 30, fontWeight: "800", lineHeight: 36 },
  alertLabel:  { fontSize: 10, fontWeight: "700", color: C.textSub, textTransform: "uppercase", letterSpacing: 0.5 },

  pendingRow: { borderLeftWidth: 4, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  pendingRowInner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pendingMed:    { fontSize: 14, fontWeight: "700", color: C.text, flex: 1, marginRight: 8 },
  pendingStatus: { fontSize: 12, color: C.textSub, marginTop: 4 },
  timePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  timePillText: { fontSize: 11, fontWeight: "800", color: "#fff" },

  actionCard: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    flexDirection: "row", alignItems: "center", padding: 16,
    shadowColor: C.text, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  actionIconCircle: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionIconText:   { fontSize: 22 },
  actionCardBody:   { flex: 1, marginLeft: 14 },
  actionCardTitle:  { fontSize: 15, fontWeight: "800", color: C.text },
  actionCardSub:    { fontSize: 13, color: C.textSub, marginTop: 2 },
  actionChevron:    { fontSize: 22, color: C.textMuted, fontWeight: "300" },

  // ── Scan ───────────────────────────────────────────────────────────────────
  scanContainer: { flex: 1, backgroundColor: "#000" },
  scanOverlayTop:    { flex: 1, backgroundColor: C.overlay },
  scanOverlayRow:    { flexDirection: "row", height: FRAME_SIZE },
  scanOverlaySide:   { flex: 1, backgroundColor: C.overlay },
  scanFrameBox:      { width: FRAME_SIZE, height: FRAME_SIZE },
  scanOverlayBottom: { flex: 1, backgroundColor: C.overlay, alignItems: "center", paddingTop: 24 },
  scanHint:          { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600", textAlign: "center", paddingHorizontal: 32 },

  corner:    { position: "absolute", width: CORNER_LEN, height: CORNER_LEN, borderColor: "#60a5fa" },
  cornerTL:  { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderTopLeftRadius: 4 },
  cornerTR:  { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 4 },
  cornerBL:  { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderBottomLeftRadius: 4 },
  cornerBR:  { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 4 },

  permissionBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  permissionTitle: { fontSize: 20, fontWeight: "800", color: "#fff", textAlign: "center" },
  permissionSub:   { fontSize: 14, color: "rgba(255,255,255,0.65)", textAlign: "center", lineHeight: 20 },

  // ── Patient profile ────────────────────────────────────────────────────────
  patientCard: {
    backgroundColor: C.surface, borderRadius: 18, padding: 18, marginVertical: 12,
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.text, shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  patientCardTop:  { flexDirection: "row", alignItems: "center" },
  patientAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.primaryLight, borderWidth: 2, borderColor: C.primaryBorder,
    alignItems: "center", justifyContent: "center",
  },
  patientAvatarText: { fontSize: 18, fontWeight: "800", color: C.primary },
  patientName: { fontSize: 20, fontWeight: "800", color: C.text, marginTop: 2 },
  patientMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  metaChip: {
    backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: C.border,
  },
  metaChipLabel: { fontSize: 10, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  metaChipValue: { fontSize: 13, fontWeight: "700", color: C.text, marginTop: 1 },

  allergyBanner: {
    backgroundColor: C.dangerLight, borderRadius: 12, padding: 12, marginTop: 14,
    borderWidth: 1, borderColor: C.dangerBorder,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  allergyTitle: { fontSize: 11, fontWeight: "800", color: "#991b1b", textTransform: "uppercase", letterSpacing: 0.5 },
  allergyText:  { fontSize: 14, color: "#b91c1c", fontWeight: "700", flex: 1 },

  orderCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderLeftWidth: 4, borderWidth: 1, borderColor: C.border,
    shadowColor: C.text, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  orderCardDim:  { opacity: 0.5 },
  orderCardTop:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  orderMedName:  { fontSize: 15, fontWeight: "800", color: C.text, flex: 1, marginRight: 8 },
  orderDetail:   { fontSize: 12, color: C.textSub, marginTop: 2 },
  dispensedNote: { fontSize: 11, color: C.textMuted, fontStyle: "italic", marginTop: 6 },
  statusPill:    { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusPillText: { fontSize: 10, fontWeight: "800" },

  // ── Verify ─────────────────────────────────────────────────────────────────
  verifyMedCard: {
    backgroundColor: C.primaryLight, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.primaryBorder, marginBottom: 12,
  },
  verifyMedName:   { fontSize: 20, fontWeight: "800", color: C.primaryDark, marginTop: 4 },
  verifyMedDetail: { fontSize: 13, color: C.primary, marginTop: 4 },
  verifyPatientRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 },
  verifyPatientLabel: { fontSize: 12, fontWeight: "700", color: C.textSub },
  verifyPatientName:  { fontSize: 14, fontWeight: "800", color: C.text },

  progressRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  progressLabel: { fontSize: 13, fontWeight: "700", color: C.textSub },
  progressPct:   { fontSize: 13, fontWeight: "800", color: C.text },
  progressTrack: { height: 8, backgroundColor: C.border, borderRadius: 999, marginBottom: 12, overflow: "hidden" },
  progressFill:  { height: 8, borderRadius: 999 },

  blockBanner: {
    backgroundColor: C.dangerLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.dangerBorder, marginBottom: 8,
  },
  blockBannerText: { fontSize: 14, fontWeight: "700", color: "#991b1b", lineHeight: 20 },

  rightRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 6,
  },
  rightLabel:  { fontSize: 14, fontWeight: "700", color: C.text, flex: 1, paddingRight: 8 },
  rightBadge:  { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 72, alignItems: "center" },
  rightBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  rowGreen:   { backgroundColor: C.successLight, borderColor: C.successBorder },
  rowYellow:  { backgroundColor: C.warningLight, borderColor: C.warningBorder },
  rowRed:     { backgroundColor: C.dangerLight,  borderColor: C.dangerBorder  },

  adminBtn: {
    backgroundColor: C.success, borderRadius: 14, paddingVertical: 17,
    alignItems: "center", marginTop: 20,
    shadowColor: C.success, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  adminBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  pendingNote:  { fontSize: 13, color: C.textSub, textAlign: "center", marginTop: 10, lineHeight: 18 },

  // ── Success ────────────────────────────────────────────────────────────────
  successScroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: C.successLight, borderWidth: 3, borderColor: C.successBorder,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  successIcon:      { fontSize: 44, color: C.success },
  successTitle:     { fontSize: 24, fontWeight: "800", color: C.text, textAlign: "center", marginBottom: 10 },
  successSub:       { fontSize: 15, color: C.textSub, textAlign: "center", lineHeight: 22, maxWidth: 280 },
  successTimestamp: { fontSize: 13, color: C.textMuted, marginTop: 8, marginBottom: 24 },
  successActions:   { width: "100%", gap: 0 },

  // ── Logs ───────────────────────────────────────────────────────────────────
  logCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.text, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  logCardError: { borderColor: C.dangerBorder, borderLeftWidth: 4, borderLeftColor: C.danger },
  logCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  logMed:     { fontSize: 15, fontWeight: "800", color: C.text, flex: 1, marginRight: 8 },
  logMeta:    { fontSize: 12, color: C.textSub, marginTop: 2 },
  logErrors:  { fontSize: 12, color: C.danger, fontWeight: "600", marginTop: 6, lineHeight: 18 },
  logOkBadge: { backgroundColor: C.successLight, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.successBorder },
  logOkText:  { fontSize: 11, fontWeight: "800", color: C.success },
  logErrBadge: { backgroundColor: C.dangerLight, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.dangerBorder },
  logErrText:  { fontSize: 11, fontWeight: "800", color: C.danger },

  readOnlyTag: { fontSize: 10, fontWeight: "800", color: C.textMuted, letterSpacing: 0.5 },

  // ── Shared ─────────────────────────────────────────────────────────────────
  padded: { padding: 16, paddingBottom: 40 },

  eyebrowBlue: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: C.primary, textTransform: "uppercase" },
  pageTitle:   { fontSize: 22, fontWeight: "800", color: C.text, marginTop: 4, marginBottom: 4 },
  pageSub:     { fontSize: 14, color: C.textSub, lineHeight: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: C.textSub, marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 },
  sectionSub:   { fontSize: 13, color: C.textSub, lineHeight: 19, marginBottom: 8, marginTop: -4 },
  label:        { fontSize: 13, fontWeight: "700", color: C.textSub },
  optionalTag:  { fontSize: 13, fontWeight: "400", color: C.textMuted },

  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    backgroundColor: C.bg, paddingHorizontal: 14, paddingVertical: 13,
    color: C.text, fontSize: 15,
  },
  textArea: { height: 110, textAlignVertical: "top" },

  infoBox: {
    backgroundColor: "#f0f9ff", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#bae6fd", marginTop: 4,
  },
  infoText: { fontSize: 13, color: "#0369a1", lineHeight: 19 },

  offlineBanner: {
    backgroundColor: C.warningLight, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.warningBorder, marginBottom: 8,
  },
  offlineText: { fontSize: 13, color: "#92400e", fontWeight: "600", lineHeight: 18 },

  emptyBox: {
    backgroundColor: C.surface, borderRadius: 16, padding: 32,
    alignItems: "center", borderWidth: 1, borderColor: C.border, marginTop: 8,
  },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyText: { fontSize: 14, color: C.textMuted, fontStyle: "italic", textAlign: "center" },

  btnPrimary: {
    backgroundColor: C.primary, borderRadius: 14,
    paddingVertical: 15, alignItems: "center", marginTop: 8,
    shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: 0.2 },
  btnSecondary: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
    paddingVertical: 14, alignItems: "center",
  },
  btnSecondaryText: { color: C.textSub, fontWeight: "700", fontSize: 15 },
  btnDanger: {
    backgroundColor: C.danger, borderRadius: 14,
    paddingVertical: 14, alignItems: "center", marginTop: 10,
    shadowColor: C.danger, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  btnDisabled: { backgroundColor: "#94a3b8", shadowOpacity: 0, elevation: 0 },

  // ── Post-eval ──────────────────────────────────────────────────────────────
  yesNoRow:         { flexDirection: "row", gap: 12, marginVertical: 6 },
  yesNoBtn:         { flex: 1, borderWidth: 2, borderRadius: 14, paddingVertical: 16, alignItems: "center", borderColor: C.border, backgroundColor: C.surface },
  yesNoBtnDanger:   { borderColor: C.danger,  backgroundColor: C.dangerLight },
  yesNoBtnSuccess:  { borderColor: C.success, backgroundColor: C.successLight },
  yesNoBtnText:     { fontSize: 17, fontWeight: "800", color: C.textSub },

  patientStatusBadge:       { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, borderWidth: 1 },
  patientStatusDischarged:  { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1" },
  patientStatusTransferred: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  patientStatusText:        { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: "#92400e" },
});
