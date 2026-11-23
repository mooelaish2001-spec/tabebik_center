# Firebase security baseline — Tabebik

## Status
This is a fail-closed security baseline, not a declaration that the apps are production-ready.
Do not deploy medical-data access until the migration and emulator tests below pass.

## Trusted identity contract
Only a trusted Admin SDK backend may set Firebase custom claims:
- patient: { role: "patient" }
- doctor: { role: "doctor", doctorLic: "<verified doctor license>" }
- center manager: { role: "center_manager", centerId: "<approved center id>" }
- center reception: { role: "center_reception", centerId: "<approved center id>" }
- platform administrator: { platformAdmin: true }

Never derive roles or center membership from a client-written Firestore field or an unverified phone number.
Do not let clients set custom claims.

## Why bookings and patient documents are temporarily closed
The current booking model places operational booking fields and health/complaint fields in the same Firestore document (including health fields spread from the patient's health profile). Firestore Security Rules cannot redact individual fields from a document. Granting a center read access to that document would expose the medical fields too. The current users document also mixes profile and health data.
Consequently, client access to users, bookings, booking private subcollections, encounters, medicalRecords and followUps is denied until the schema is split and migrated.

## Required target data model
- users/{uid}: non-medical profile only.
- patients/{uid}/medical/{recordId}: medical data; patient-controlled access.
- bookings/{bookingId}: operational fields only (patientUid, centerId, doctorLic, service type, schedule, price, status, receipt metadata).
- bookings/{bookingId}/private/{recordId}: medical details, complaint, history and files metadata.
- patientDoctorGrants/{uid}_{doctorUid}: explicit, revocable patient grant with patientUid, doctorUid, bookingId, active, grantedAt, revokedAt.
- centerMembers/{memberUid}: server-managed membership keyed by Firebase UID, not phone number.
- doctors/{doctorLic}: public directory only; verification set by trusted backend.
- encounters/{id} and followUps/{id}: server-managed linkage to patientUid and doctorUid plus explicit grant.
- medical files: Storage medical/{patientUid}/{recordId}/{fileId}; encrypt client-side before upload and store only ciphertext.

## Encryption requirements
Firebase transport encryption and at-rest encryption are platform protections, not end-to-end encryption. Before storing real medical data:
- encrypt on the client using authenticated encryption (AES-256-GCM or an equivalent vetted AEAD);
- use a fresh random nonce for every encryption under a key;
- use a random per-record/file data key; wrap it with a managed key-encryption key;
- keep wrapping keys in KMS/Secret Manager or a dedicated key-management service, never in the Flutter source, Firestore, or remote config;
- define device recovery, multi-device access, doctor key sharing, revocation and key rotation;
- never log plaintext, keys, tokens, medical file URLs or medical payloads.

## Deployment gates
1. Migrate the mixed booking/user schema; remove health fields from operational booking documents.
2. Provision and test custom claims from a trusted backend.
3. Implement patient consent and doctor-to-booking assignment records.
4. Write allow rules for the separated schema and storage paths.
5. Add Firebase Emulator tests for unauthenticated, patient owner, assigned doctor, unrelated doctor, center manager, reception and admin.
6. Deploy only after all tests pass and a security review confirms no cross-role reads/writes.


## 2026-11 schema migration work (client API stage)
- The shared Firebase helper now has an operational-booking allowlist. It rejects unknown keys (including complaint and health payloads) and requires the signed-in UID to match patientUid.
- A separate medical-private write API requires an authenticated patient, explicit consent flag, and doctor UID; it stores the medical payload under bookings/{bookingId}/private/medical with patientUid/doctorUid metadata.
- A revocation-request helper writes a patient-doctor grant revocation request.
- IMPORTANT: these client helpers are preparatory only. Current Firestore rules intentionally deny booking/private/grant writes, and the main.dart booking flows still need to be migrated away from direct Firestore writes. Do not deploy or treat this as production-ready until backend authorization, consent grant lifecycle, encryption, rules and emulator tests are completed.


## Center Cloud Functions backend — staged, not deployed
The center repository now contains a Node.js 20 / TypeScript Functions codebase:
- `setCenterMemberRole`: only an existing `platformAdmin: true` custom claim can assign a center role. It verifies that the center document is approved and uses Firebase UID.
- `setCenterMemberActive`: a manager can deactivate a member only inside the manager's own center; deactivation also removes matching center role claims. Reactivation/role re-issuance remains a platform-admin operation.
- `listCenterBookings`: requires center role claims and returns an explicit operational-field projection for that claim's center. It never reads private subcollections.
- `updateCenterBooking`: checks center scope and applies a restrictive status-transition policy transactionally.

### Important deployment and integration blockers
- No function has been deployed. No Firebase rules were opened.
- A trusted operator must provision the first platform administrator out-of-band using the Admin SDK after identity verification. No client-facing bootstrap endpoint exists.
- The Flutter center app now creates a persistent Firebase Anonymous Auth identity when Firebase is initialized, displays the UID, and refuses entry until a trusted platform administrator assigns matching center_manager or center_reception custom claims and a matching active centerMembers/{uid} record. Anonymous Auth alone grants no center access. The login and demo OTP paths are removed. The platform administrator must verify the center/operator out-of-band before provisioning the UID.
- The booking schema must be migrated so each `bookings/{id}` document contains operational fields only. The callable projection reduces accidental disclosure but cannot make a mixed-schema document safe for direct client reads.
- Firestore index may be required for `centerId + createdAt desc`; create it only after validating the deployed query and index error.
- Firebase Emulator authorization tests, real dependency installation/build, claims provisioning runbook, consent lifecycle, medical encryption/key management, and production security review remain required.

The backend is a guarded first implementation, not a production-ready booking service. Keep the current deny-by-default Firestore and Storage rules until the remaining gates pass.


## Center app integration update — 2026-11-23
- The center app initializes Firebase and attempts a persistent Firebase Anonymous Auth session. This is an identity placeholder only; no access is granted until a platform administrator provisions the UID with appropriate custom claims and a matching active membership document after out-of-band verification.
- Demo login, fake OTP UI/service, and seeded demo center/doctor registry data were removed/disabled.
- The center bookings screen now calls listCenterBookings and status changes call updateCenterBooking; it no longer relies on the local demo booking list for this screen.
- The callable projection maps the current patient booking schema to center-friendly labels and excludes visit, complaints, diagnoses, medical history, and private records.
- The center sets the price when confirming a pending booking. The backend rejects a missing/zero price and rejects price changes outside that transition.
- The center cannot mark a doctor appointment completed; only the assigned doctor can complete an in-person visit and issue the encounter code.
- firestore.indexes.json includes the centerId + createdAt descending index used by the booking inbox.
- No Functions or rules have been deployed, and the Firestore/Storage rules remain fail-closed.
