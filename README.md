# SafeMedsQR

Academic healthcare research prototype to reduce medication administration errors through QR verification and the Fourteen Rights framework.

## Monorepo Structure

- `apps/api` — Express REST API (TypeScript)
- `apps/web` — SvelteKit admin/research UI (TypeScript)
- `apps/mobile` — Expo React Native nurse app (TypeScript)

## Features Implemented

### Mobile (Primary)
- Nurse login (mock auth) with `nurseId` attached to actions
- QR scan order:
  1. Patient QR (`patientId`)
  2. Medication QR (`medicationId`)
- Automatic verification:
  - Right Patient
  - Right Drug
  - Right Dose
  - Right Route
  - Right Time
  - Right Prescription
- Manual nurse confirmation only:
  - Right Assessment
  - Right Education
  - Right Evaluation
  - Right Approach
  - Right Principle of Care
  - Right to Refuse
  - Right Documentation
- Fourteen Rights checklist color statuses:
  - Green = verified
  - Yellow = nurse confirmation required
  - Red = mismatch/error
- Error alert state blocks unsafe medication confirmation
- Confirmation logging payload:
  - `nurseId`
  - `patientId`
  - `medicationId`
  - `timestamp`
  - `errorTypes`

### Web (Secondary)
- Basic admin login
- CRUD UI for:
  - Patients
  - Medications
  - Medication Orders
- Dashboard metrics:
  - Total scans
  - Total errors detected
  - Errors grouped by type
- Logs table with date range filtering

### API
REST endpoints:
- `POST /auth/login`
- `GET/POST/PUT/DELETE /patients`
- `GET/POST/PUT/DELETE /medications`
- `GET/POST/PUT/DELETE /orders`
- `GET/POST /logs`
- `GET /health`

Data model collections:
- `users`
- `patients`
- `medications`
- `medication_orders` (implemented as `orders`)
- `scan_logs` (implemented as `scanLogs`)

## Setup

From repository root:

```bash
npm install
```

## Run

### API
```bash
npm run dev:api
```
Runs at `http://localhost:4000` (and binds on `0.0.0.0` for LAN access from phones)

### Web
```bash
npm run dev:web
```

### Mobile
```bash
npm run dev:mobile
```

## Notes

- This is a prototype for research use, not production clinical deployment.
- Clinical judgment rights are intentionally manual and never auto-verified.
- For physical devices, prefer setting `EXPO_PUBLIC_API_BASE_URL` to your computer LAN IP (example: `http://192.168.1.50:4000`).

## Troubleshooting Expo Go QR / "Problem running requested app"

1. Start mobile with tunnel mode if LAN is restricted:
   ```bash
   npm run dev:mobile -- --tunnel
   ```
2. Confirm API is running and reachable from phone browser:
   - `http://<your-pc-lan-ip>:4000/health`
3. If needed, set API URL explicitly before starting Expo:
   - CMD:
     ```bat
     set EXPO_PUBLIC_API_BASE_URL=http://<your-pc-lan-ip>:4000 && npm run dev:mobile
     ```
4. Clear Metro cache:
   ```bash
   npx expo start -c
   ```
5. Ensure Windows Firewall allows Node.js/Expo on private network.
