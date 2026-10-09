/**
 * A.E.G.I.S — Home View Component
 * Hero section, 24/7 emergency hotline ribbon, key platform pillars, and demo disclaimers.
 */

export function renderHomeView() {
  return `
    <div class="hero-section">
      <div class="hero-tag">
        <span>🛡️ Automated Escalation, Grievance & Incident Shield</span>
      </div>
      <h1 class="hero-title">Protecting Campus Voices with Autonomous Accountability</h1>
      <p class="hero-description">
        A.E.G.I.S safeguards students and faculty with confidential grievance reporting, 
        deterministic multi-tier escalation, and dual-credential complaint tracking. 
        Zero administrative friction. Zero retaliation risk.
      </p>

      <div class="hero-actions">
        <a href="#report" class="btn btn-primary btn-lg">
          <span>📢</span> Report an Incident
        </a>
        <a href="#track" class="btn btn-secondary btn-lg">
          <span>🔍</span> Track Complaint Status
        </a>
        <a href="#dashboard" class="btn btn-secondary btn-lg">
          <span>🏛️</span> Authority Dashboard
        </a>
      </div>
    </div>

    <!-- 24/7 Campus Emergency Hotline Strip -->
    <div class="sos-banner" role="region" aria-label="Emergency Hotlines">
      <div class="sos-content">
        <div class="sos-icon" aria-hidden="true">🆘</div>
        <div class="sos-text">
          <h4>Immediate Campus Crisis or Physical Danger?</h4>
          <p>If you are in imminent physical hazard, contact Campus Rapid Response or National Emergency Services immediately.</p>
        </div>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <span class="badge" style="background:#881337; color:#fecdd3; border: 1px solid #f43f5e; font-size: 0.8rem; padding: 6px 12px;">
          Campus Control Room: <strong>1800-CAMPUS-SAFE</strong>
        </span>
        <span class="badge" style="background:#1e1b4b; color:#c7d2fe; border: 1px solid #6366f1; font-size: 0.8rem; padding: 6px 12px;">
          National Women Helpline: <strong>1091</strong>
        </span>
        <span class="badge" style="background:#064e3b; color:#a7f3d0; border: 1px solid #10b981; font-size: 0.8rem; padding: 6px 12px;">
          National Cyber Cell: <strong>1930</strong>
        </span>
      </div>
    </div>

    <!-- Prototype Transparency & Security Notice -->
    <div class="alert alert-info" style="margin-bottom: var(--spacing-8);">
      <div style="font-size: 1.25rem;">ℹ️</div>
      <div>
        <strong>Demonstration Prototype Disclosure (90-Minute Competition Sprint):</strong>
        <p style="margin: 4px 0 0; color: inherit; font-size: 0.85rem;">
          This platform demonstrates client-side workflow architectures, deterministic escalation logic, 
          and identity masking mechanisms. Data persistence uses browser <code>localStorage</code> with synthetic demo cases. 
          No real victim identities or production evidence should be submitted into this demonstration environment.
        </p>
      </div>
    </div>

    <!-- Core Operational Pillars -->
    <div class="section-header">
      <h2 class="section-title"><span>⚙️</span> How A.E.G.I.S Enforces Campus Safety</h2>
      <p class="section-subtitle">Engineered to eliminate bottleneck delays and institutional suppression of grievances.</p>
    </div>

    <div class="feature-grid">
      <div class="feature-card">
        <div class="feature-icon">⚡</div>
        <h3 style="font-size: 1.1rem; margin-bottom: 8px;">Deterministic Auto-Escalation</h3>
        <p style="font-size: 0.875rem;">
          Complaints are linked by case correlation. Report #1 routes to HOD. A 2nd linked report auto-escalates to Dean. 
          Three or more linked reports escalate the entire case directly to the Campus Higher Authority / Ombudsperson.
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🛡️</div>
        <h3 style="font-size: 1.1rem; margin-bottom: 8px;">Multi-Tier Identity Masking</h3>
        <p style="font-size: 0.875rem;">
          Choose between <strong>Anonymous Mode</strong> (zero credentials retained anywhere) or 
          <strong>Confidential Whistleblower Mode</strong> (contact details shielded from departmental HODs & Deans, revealed only to Higher Authority for protected inquiry).
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🔑</div>
        <h3 style="font-size: 1.1rem; margin-bottom: 8px;">Dual-Credential Verification</h3>
        <p style="font-size: 0.875rem;">
          Every submission issues a unique Complaint Reference ID (e.g., <code>AEG-2026-X7K2</code>) paired with a 
          separate 6-digit demonstration verification PIN, preventing unauthorized tracking access while keeping the tracking view strictly read-only.
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">📋</div>
        <h3 style="font-size: 1.1rem; margin-bottom: 8px;">Append-Only Audit Trail</h3>
        <p style="font-size: 0.875rem;">
          Every automated tier progression, authority status change, and administrative remark is recorded with an immutable timestamped log, 
          guaranteeing complete procedural transparency for review boards.
        </p>
      </div>
    </div>
  `;
}
