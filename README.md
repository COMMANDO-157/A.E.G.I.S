# A.E.G.I.S
A.E.G.I.S (Automated Escalation, Grievance &amp; Incident Shield) is a campus safety platform for confidential incident reporting, complaint tracking, and automated authority escalation.

## Overview
A.E.G.I.S is a responsive, zero-build web application developed for rapid-deployment campus safety, grievance redressal, and anti-harassment protection. It eliminates administrative reporting bottlenecks and protects whistleblowers through multi-tier deterministic auto-escalation.

## Tech Stack & Architecture
- **Foundation:** Semantic HTML5, Modern CSS3, and Vanilla JavaScript (ES Modules).
- **Architecture:** Zero-build single-page application (SPA) with client-side hash routing (`#home`, `#report`, `#track`, `#dashboard`).
- **Design System:** Dark navy/teal palette with restrained cyan accents, subtle glassmorphism, responsive grid/flexbox layouts, and WCAG AA contrast compliance.
- **Serving:** Static files runnable on any local web server (e.g., `python -m http.server 5500` or VS Code Live Server).

## Core Capabilities
1. **Incident Grievance Reporting:**
   - Classification of online (digital/cyber) and offline (campus/hostel/lab) grievances.
   - Comprehensive metadata capture: Date, time, location/platform, factual statement, optional suspect metadata.
   - Independent tracking of **Incident Severity** (Low, Moderate, Critical) and **Urgency** (Routine, Urgent, Immediate Danger).
   - High-risk emergency guidance prompts linking directly to campus and national distress lines.
   - Optional evidence attachment with strict client-side format (`.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`) and size validation ($\le 5\text{MB}$).
   - Three distinct confidentiality tiers:
     - **Anonymous Mode:** Zero personal information collected or stored.
     - **Confidential Whistleblower Mode:** Contact info collected but strictly masked from Tier 1 (HOD) and Tier 2 (Dean) displays, accessible only by Tier 3 (Higher Authority / Ombudsperson).
     - **Standard Mode:** Transparent identity disclosure across all tiers.
   - Dual-credential issuance upon filing: Unique Complaint Reference ID (e.g., `AEG-2026-X7K2`) + separate 6-digit demo verification PIN.

2. **Dual-Credential Complaint Tracking:**
   - Public tracking view strictly locked into read-only mode to prevent arbitrary tampering.
   - Requires both Reference ID and 6-digit Verification PIN.
   - Displays severity/urgency assessments, routing origin explanations, and step-by-step escalation timeline with complete chronological audit records.

3. **Dual-Engine Escalation & Severity Routing:**
   - **Decision Rule:** `Final Tier = MAX(Severity Tier, Repeat-Report Tier, Current Case Tier)`
   - **Severity Routing:** Low $\rightarrow$ HOD (Tier 1), Moderate $\rightarrow$ Dean (Tier 2), Critical $\rightarrow$ Higher Authority (Tier 3). Critical cases immediately bypass lower tiers.
   - **Linked-Case Escalation:** 1st Report $\rightarrow$ HOD, 2nd Report $\rightarrow$ Dean, 3rd+ Reports $\rightarrow$ Higher Authority.
   - **Anti-Downgrade Guarantee:** Filing subsequent low-risk reports into an already escalated case group never automatically downgrades the case.
   - **Case Group Synchronization:** All members of a linked case group are promoted to the maximum case tier while preserving full individual complaint history.
   - Append-only demonstration audit logging recording timestamps, actors, destination tiers, and transparent rule-based justifications.

4. **Authority Triage Dashboard:**
   - Interactive demonstration role switcher (`HOD`, `Dean`, `Higher Authority`).
   - Dynamic identity masking enforcing whistleblower shielding for HOD and Dean tiers.
   - Triage actions: Case inspection, status updates (`In Review`, `Under Investigation`, `Action Taken`, `Resolved`).
   - **Manual Routing Override Controls:** Authorized roles may override routing with mandatory administrative justification ($\ge 15$ characters); unauthorized downgrades of Critical incidents are strictly blocked.
   - Fast demo reset button restoring factory seed records with one click.

## Launch & Local Testing Instructions
To launch the application locally, start a static web server from the repository root:

```bash
# Using Python 3:
python -m http.server 5500
```
Open your browser and navigate to:
```
http://localhost:5500
```

To run the automated verification suite:
```bash
node test_verification.js
```

## Demonstration & Security Disclosure
- **Browser Storage:** This prototype uses browser `localStorage` for synthetic demo persistence. Real confidential records or evidence should not be stored in client-side storage.
- **Verification PIN & Role Switcher:** Client-side role switching is provided exclusively for hackathon evaluation and does not replace server-side role-based access control (RBAC) and authentication.
