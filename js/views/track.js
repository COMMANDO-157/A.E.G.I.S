/**
 * A.E.G.I.S — Complaint Tracking View Component
 * Dual-credential lookup (Ref ID + 6-digit PIN), strictly read-only for reporters,
 * displaying escalation timeline, authority tier, independent severity/urgency, and audit trail.
 */

import { store } from '../store.js';
import { escapeHtml } from '../security.js';
import { 
  renderStatusBadge, 
  renderAuthorityBadge, 
  renderIdentityBadge, 
  renderSeverityBadge, 
  renderUrgencyBadge, 
  renderRoutingOriginBadge, 
  showToast 
} from '../ui.js';

export function renderTrackView() {
  return `
    <div class="section-header">
      <h1 class="section-title"><span>🔍</span> Grievance Tracking & Verification</h1>
      <p class="section-subtitle">
        Securely query investigation status using your unique Reference ID and 6-digit demo verification PIN.
      </p>
    </div>

    <!-- Dual-Credential Query Card -->
    <div class="card track-lookup-card">
      <div class="card-header">
        <h3 class="card-title"><span>🔑</span> Dual-Credential Status Inquiry</h3>
        <span class="badge badge-demo">Read-Only View</span>
      </div>

      <form id="track-form" novalidate>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-4);">
          <div class="form-group">
            <label class="form-label" for="track-ref-id">
              Complaint Reference ID <span class="required">*</span>
            </label>
            <input type="text" id="track-ref-id" class="form-input" 
              placeholder="e.g. AEG-2026-X7K2" required autocomplete="off" />
            <span id="err-track-ref" class="form-error-msg">Reference ID is required.</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="track-pin">
              6-Digit Verification PIN <span class="badge badge-demo" style="font-size: 0.65rem;">Demo Only</span>
            </label>
            <input type="text" id="track-pin" class="form-input" 
              placeholder="e.g. 482910" maxlength="6" required autocomplete="off" />
            <span id="err-track-pin" class="form-error-msg">Valid 6-digit PIN is required.</span>
          </div>
        </div>

        <button type="submit" id="btn-query-status" class="btn btn-primary btn-block">
          <span>🔍</span> Query Complaint Records
        </button>

        <!-- Pre-seeded Demonstration Quick Chips -->
        <div style="margin-top: var(--spacing-4); padding-top: var(--spacing-3); border-top: 1px solid var(--color-border-subtle);">
          <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 6px;">
            🧪 Fast-Test Pre-Seeded Demonstration Records:
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm chip-autofill" 
              data-ref="AEG-2026-X7K2" data-pin="482910">
              Hostel Case (Dean Tier): AEG-2026-X7K2
            </button>
            <button type="button" class="btn btn-secondary btn-sm chip-autofill" 
              data-ref="AEG-2026-P9R4" data-pin="820145">
              Cyber Case (Confidential): AEG-2026-P9R4
            </button>
            <button type="button" class="btn btn-secondary btn-sm chip-autofill" 
              data-ref="AEG-2026-M3W9" data-pin="319482">
              Escalated Lab Case (Dean Tier): AEG-2026-M3W9
            </button>
          </div>
        </div>
      </form>
    </div>

    <!-- Results Display Container -->
    <div id="track-results-container"></div>
  `;
}

export function initTrackView() {
  const form = document.getElementById('track-form');
  const refInput = document.getElementById('track-ref-id');
  const pinInput = document.getElementById('track-pin');
  const resultsContainer = document.getElementById('track-results-container');
  if (!form || !refInput || !pinInput || !resultsContainer) return;

  // Check if credentials were pass-through stored in sessionStorage
  const prefillRef = sessionStorage.getItem('aegis_prefill_ref');
  const prefillPin = sessionStorage.getItem('aegis_prefill_pin');
  if (prefillRef && prefillPin) {
    refInput.value = prefillRef;
    pinInput.value = prefillPin;
    sessionStorage.removeItem('aegis_prefill_ref');
    sessionStorage.removeItem('aegis_prefill_pin');
    setTimeout(() => form.dispatchEvent(new Event('submit')), 100);
  }

  // Quick autofill chip buttons
  document.querySelectorAll('.chip-autofill').forEach(btn => {
    btn.addEventListener('click', () => {
      refInput.value = btn.getAttribute('data-ref');
      pinInput.value = btn.getAttribute('data-pin');
      form.dispatchEvent(new Event('submit'));
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const ref = refInput.value.trim().toUpperCase();
    const pin = pinInput.value.trim();

    let valid = true;
    const errRef = document.getElementById('err-track-ref');
    const errPin = document.getElementById('err-track-pin');
    errRef.classList.remove('visible');
    errPin.classList.remove('visible');

    if (!ref) {
      errRef.classList.add('visible');
      valid = false;
    }
    if (!pin || pin.length < 4) {
      errPin.classList.add('visible');
      valid = false;
    }

    if (!valid) return;

    const complaint = store.getComplaintByCredentials(ref, pin);

    if (!complaint) {
      resultsContainer.innerHTML = `
        <div class="card track-result-card" style="text-align: center; border-color: #f43f5e; padding: var(--spacing-8);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">❌</div>
          <h3 style="color: #fb7185;">Record Not Found</h3>
          <p style="font-size: 0.9rem; max-width: 480px; margin: 8px auto 0;">
            No complaint record matched the combination of Reference ID <code>${escapeHtml(ref)}</code> 
            and the provided verification PIN. Please verify your credentials.
          </p>
        </div>
      `;
      showToast('No record found matching those credentials', 'error');
      return;
    }

    // Render detailed read-only complaint summary
    renderComplaintDetails(complaint, resultsContainer);
    showToast('Complaint record retrieved', 'success');
  });
}

function renderComplaintDetails(complaint, container) {
  const auditLogs = complaint.auditLogs || [];

  container.innerHTML = `
    <div class="card track-result-card">
      <!-- Status & Tier Header -->
      <div class="card-header" style="flex-wrap: wrap; gap: 8px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
            <h2 style="font-size: 1.4rem; font-family: var(--font-family-mono); margin: 0; color: var(--color-primary-light);">
              ${escapeHtml(complaint.referenceId)}
            </h2>
            ${renderStatusBadge(complaint.status)}
            ${renderAuthorityBadge(complaint.assignedAuthority)}
            ${renderSeverityBadge(complaint.severity)}
            ${renderUrgencyBadge(complaint.urgency)}
            ${renderRoutingOriginBadge(complaint.routingOrigin)}
          </div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted);">
            Filed on: ${new Date(complaint.createdAt).toLocaleString()} | Case Group: 
            <strong>${escapeHtml(complaint.caseGroupId || 'Independent')}</strong>
          </div>
        </div>

        <div>
          ${renderIdentityBadge(complaint.identityMode)}
        </div>
      </div>

      <!-- Security Notice: Read-Only Reporter Interface -->
      <div class="alert alert-info" style="font-size: 0.8rem; margin-bottom: var(--spacing-5);">
        <div>🛡️</div>
        <div>
          <strong>Read-Only Public Reporter Tracking Interface:</strong>
          Arbitrary editing or tampering is strictly locked on this screen. Only authenticated campus authorities 
          can record investigation updates, override routing with administrative justification, or adjust grievance statuses.
        </div>
      </div>

      <!-- Rule-Based Risk Assessment Card (Refinement 3) -->
      <div style="background-color: rgba(6, 182, 212, 0.08); border-left: 3px solid var(--color-primary); padding: var(--spacing-4); border-radius: var(--radius-md); margin-bottom: var(--spacing-5); font-size: 0.85rem;">
        <div style="font-weight: 600; color: var(--color-primary-light); margin-bottom: 4px;">
          📊 Transparent Rule-Based Routing Rationale:
        </div>
        <div style="color: var(--color-text-primary); line-height: 1.5;">
          ${escapeHtml(complaint.severityReason || 'Standard procedural evaluation.')}
        </div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
          Routing Rule: <code>Final Tier = MAX(Severity Tier, Repeat-Report Tier, Current Case Tier)</code>
        </div>
      </div>

      <!-- Core Details Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--spacing-4); margin-bottom: var(--spacing-6); background: var(--color-bg-surface); padding: var(--spacing-4); border-radius: var(--radius-md);">
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Category:</span>
          <div style="font-weight: 500;">${escapeHtml(complaint.category)}</div>
        </div>
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Environment:</span>
          <div>${escapeHtml(complaint.incidentType)}</div>
        </div>
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Incident Date & Time:</span>
          <div>${new Date(complaint.dateTime).toLocaleString()}</div>
        </div>
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Location / Platform:</span>
          <div>${escapeHtml(complaint.location)}</div>
        </div>
      </div>

      <!-- Factual Narrative Description -->
      <div style="margin-bottom: var(--spacing-6);">
        <h4 style="font-size: 0.95rem; color: var(--color-primary-light); margin-bottom: 6px;">
          Factual Incident Statement
        </h4>
        <div style="background-color: var(--color-bg-surface); padding: var(--spacing-4); border-radius: var(--radius-md); border-left: 3px solid var(--color-primary); font-size: 0.9rem; line-height: 1.6;">
          ${escapeHtml(complaint.description)}
        </div>
      </div>

      <!-- Suspect Details (if reported) -->
      ${complaint.suspectName ? `
        <div style="margin-bottom: var(--spacing-6); background-color: var(--color-bg-surface); padding: var(--spacing-4); border-radius: var(--radius-md);">
          <h4 style="font-size: 0.9rem; color: var(--color-text-primary); margin-bottom: 6px;">
            Reported Suspect Information
          </h4>
          <div style="font-size: 0.85rem; color: var(--color-text-secondary);">
            <strong>Name:</strong> ${escapeHtml(complaint.suspectName)} | 
            <strong>Department:</strong> ${escapeHtml(complaint.suspectDepartment || 'Unspecified')} | 
            <strong>Contact:</strong> ${escapeHtml(complaint.suspectPhone || 'None Provided')}
          </div>
        </div>
      ` : ''}

      <!-- Attached Evidence Status -->
      ${complaint.evidenceFile ? `
        <div style="margin-bottom: var(--spacing-6); padding: var(--spacing-3); background-color: rgba(6, 182, 212, 0.08); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); display: flex; align-items: center; justify-content: space-between;">
          <div style="font-size: 0.85rem;">
            📎 <strong>Simulated Evidence Attached:</strong> ${escapeHtml(complaint.evidenceFile.name)} 
            (${escapeHtml(complaint.evidenceFile.sizeFormatted)})
          </div>
          <span class="badge badge-demo">Client Simulation</span>
        </div>
      ` : ''}

      <!-- Append-Only Audit Trail & Escalation Timeline -->
      <div style="margin-top: var(--spacing-6); padding-top: var(--spacing-6); border-top: 1px solid var(--color-border-subtle);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-3); flex-wrap: wrap; gap: 8px;">
          <h4 style="font-size: 1.05rem; margin: 0; color: var(--color-primary-light);">
            📋 Append-Only Escalation & Audit Trail
          </h4>
          <span class="badge badge-demo">Demonstration Audit Log</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: var(--spacing-4);">
          Chronological record of autonomous case escalations, tier assignments, and administrative remarks.
        </p>

        <div class="timeline">
          ${auditLogs.map((log) => {
            const isEscalation = (log.action || '').includes('ESCALAT') || (log.action || '').includes('BYPASS');
            return `
              <div class="timeline-step completed ${isEscalation ? 'escalated' : ''}">
                <div class="timeline-icon"></div>
                <div class="timeline-meta">${escapeHtml(log.displayTime || log.timestamp)}</div>
                <div class="timeline-title">
                  ${escapeHtml(log.action.replace(/_/g, ' '))} &rarr; Tier: ${escapeHtml(log.destination || 'Unassigned')}
                </div>
                <div class="timeline-desc">
                  <strong>Logged by:</strong> ${escapeHtml(log.actor || 'System Engine')}<br />
                  ${escapeHtml(log.remarks)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}
