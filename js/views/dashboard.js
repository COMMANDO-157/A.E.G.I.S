/**
 * A.E.G.I.S — Authority Triage Dashboard Component
 * Role-specific demonstration views (HOD, Dean, Higher Authority).
 * Displays severity, assessment reasons, routing origin, enforces whistleblower masking,
 * provides triage actions, and enables manual routing overrides with mandatory justification
 * and strict anti-downgrade protections.
 */

import { store } from '../store.js';
import { escapeHtml, maskIdentity } from '../security.js';
import { 
  renderStatusBadge, 
  renderAuthorityBadge, 
  renderSeverityBadge, 
  renderUrgencyBadge, 
  renderRoutingOriginBadge, 
  openModal, 
  closeModal, 
  showToast 
} from '../ui.js';
import { AUTHORITY_TIERS, SEVERITY_LEVELS } from '../escalation.js';

let currentRole = AUTHORITY_TIERS.HOD;
let currentFilter = 'my-tier'; // 'my-tier' | 'all' | 'critical' | 'escalated' | 'resolved'

export function renderDashboardView() {
  return `
    <div class="section-header">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <h1 class="section-title"><span>🏛️</span> Authority Triage & Escalation Dashboard</h1>
          <p class="section-subtitle">
            Restricted departmental and ombudsperson incident management interface.
          </p>
        </div>
        <button type="button" id="btn-reset-demo-data" class="btn btn-secondary btn-sm" title="Restore factory demo records">
          🔄 Reset Demo Dataset
        </button>
      </div>
    </div>

    <!-- Demonstration Role Disclaimer Notice -->
    <div class="alert alert-warning" style="margin-bottom: var(--spacing-6);">
      <div style="font-size: 1.25rem;">⚠️</div>
      <div>
        <strong>Demonstration Role Switcher (Prototype Notice):</strong>
        <p style="margin: 3px 0 0; color: inherit; font-size: 0.85rem;">
          This interactive role switcher is provided exclusively for competition evaluation. 
          Client-side JavaScript does not constitute genuine security or role-based access control (RBAC). 
          In production, tiers are cryptographically authenticated via institutional SSO and server-side RBAC.
        </p>
      </div>
    </div>

    <!-- Dashboard Controls: Role Switcher & Filter Tabs -->
    <div class="dashboard-controls">
      <div class="role-switcher-group">
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-primary);">
          Active Triage Role:
        </span>
        <div class="role-btn-group" role="tablist" aria-label="Authority Role Switcher">
          <button type="button" class="role-btn ${currentRole === AUTHORITY_TIERS.HOD ? 'active' : ''}" 
            data-role="${AUTHORITY_TIERS.HOD}">
            🏢 Tier 1: HOD
          </button>
          <button type="button" class="role-btn ${currentRole === AUTHORITY_TIERS.DEAN ? 'active' : ''}" 
            data-role="${AUTHORITY_TIERS.DEAN}">
            🎓 Tier 2: Dean
          </button>
          <button type="button" class="role-btn ${currentRole === AUTHORITY_TIERS.HIGHER_AUTH ? 'active' : ''}" 
            data-role="${AUTHORITY_TIERS.HIGHER_AUTH}">
            ⚖️ Tier 3: Higher Authority
          </button>
        </div>
      </div>

      <!-- Quick Filter Buttons -->
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary btn-sm filter-tab ${currentFilter === 'my-tier' ? 'btn-primary' : ''}" data-filter="my-tier">
          Assigned to My Tier
        </button>
        <button type="button" class="btn btn-secondary btn-sm filter-tab ${currentFilter === 'all' ? 'btn-primary' : ''}" data-filter="all">
          All Cases
        </button>
        <button type="button" class="btn btn-secondary btn-sm filter-tab ${currentFilter === 'critical' ? 'btn-primary' : ''}" data-filter="critical">
          ⚡ Critical Risks
        </button>
        <button type="button" class="btn btn-secondary btn-sm filter-tab ${currentFilter === 'escalated' ? 'btn-primary' : ''}" data-filter="escalated">
          Escalated Cases
        </button>
        <button type="button" class="btn btn-secondary btn-sm filter-tab ${currentFilter === 'resolved' ? 'btn-primary' : ''}" data-filter="resolved">
          Resolved Cases
        </button>
      </div>
    </div>

    <!-- Current Role Identity Protection Status Banner -->
    <div id="role-privacy-banner" style="margin-bottom: var(--spacing-6); padding: var(--spacing-3) var(--spacing-4); border-radius: var(--radius-md); background: rgba(15, 23, 42, 0.6); border: 1px solid var(--color-border-subtle); font-size: 0.85rem;">
      <!-- Populated dynamically -->
    </div>

    <!-- Metrics Bar -->
    <div id="dashboard-stats-grid" class="stats-grid">
      <!-- Populated dynamically -->
    </div>

    <!-- Triage Table -->
    <div class="card" style="padding: 0; overflow: hidden;">
      <div style="padding: var(--spacing-4) var(--spacing-6); border-bottom: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <h3 style="font-size: 1rem; margin: 0; color: var(--color-text-primary);">
          Grievance Triage & Escalation Queue
        </h3>
        <span id="queue-count-badge" class="badge badge-demo">0 Records</span>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ref ID & Case</th>
              <th>Category & Severity</th>
              <th>Incident Time</th>
              <th>Reporter Identity</th>
              <th>Assigned Tier & Origin</th>
              <th>Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="triage-table-body">
            <!-- Populated dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function initDashboardView() {
  updateDashboardContent();

  // Role switcher click handler
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRole = btn.getAttribute('data-role');
      updateDashboardContent();
      showToast(`Switched active view to ${currentRole}`, 'info');
    });
  });

  // Filter tabs handler
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');
      currentFilter = btn.getAttribute('data-filter');
      updateDashboardContent();
    });
  });

  // Reset demo data handler
  document.getElementById('btn-reset-demo-data')?.addEventListener('click', () => {
    if (confirm('Reset demo complaints back to default seed records?')) {
      store.resetToSeedData();
      updateDashboardContent();
      showToast('Demo dataset reset to initial state', 'success');
    }
  });
}

function updateDashboardContent() {
  const allComplaints = store.getComplaints();
  const privacyBanner = document.getElementById('role-privacy-banner');
  const statsGrid = document.getElementById('dashboard-stats-grid');
  const tbody = document.getElementById('triage-table-body');
  const countBadge = document.getElementById('queue-count-badge');

  if (!privacyBanner || !statsGrid || !tbody) return;

  // Update privacy disclosure banner according to current role
  if (currentRole === AUTHORITY_TIERS.HIGHER_AUTH) {
    privacyBanner.innerHTML = `
      <span style="color: #34d399; font-weight: 600;">⚖️ Ombudsperson Full Access:</span> 
      You are viewing Tier 3 (Higher Authority). Confidential whistleblower contact details are 
      <strong>unmasked</strong> for protected investigation protocols. Purely anonymous reports remain without identity.
    `;
  } else {
    privacyBanner.innerHTML = `
      <span style="color: #38bdf8; font-weight: 600;">🔒 Whistleblower Shield Enforced (${escapeHtml(currentRole)}):</span> 
      All confidential whistleblower identities are <strong>strictly masked</strong> from this tier. 
      Retaliation safeguards prevent departmental staff from seeing reporter details.
    `;
  }

  // Filter complaints
  let filtered = allComplaints;
  if (currentFilter === 'my-tier') {
    filtered = allComplaints.filter(c => c.assignedAuthority === currentRole);
  } else if (currentFilter === 'critical') {
    filtered = allComplaints.filter(c => c.severity === SEVERITY_LEVELS.CRITICAL);
  } else if (currentFilter === 'escalated') {
    filtered = allComplaints.filter(c => c.status === 'Escalated' || c.assignedAuthority !== AUTHORITY_TIERS.HOD);
  } else if (currentFilter === 'resolved') {
    filtered = allComplaints.filter(c => c.status === 'Resolved');
  }

  // Update statistics
  const roleComplaints = allComplaints.filter(c => c.assignedAuthority === currentRole);
  const pendingCount = roleComplaints.filter(c => c.status === 'Pending' || c.status === 'In Review').length;
  const criticalCount = allComplaints.filter(c => c.severity === SEVERITY_LEVELS.CRITICAL).length;
  const resolvedCount = roleComplaints.filter(c => c.status === 'Resolved').length;

  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-num" style="color: var(--color-primary-light);">${roleComplaints.length}</div>
      <div class="stat-label">Assigned to ${escapeHtml(currentRole)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color: #fbbf24;">${pendingCount}</div>
      <div class="stat-label">Awaiting Review</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color: #fb7185;">${criticalCount}</div>
      <div class="stat-label">Campus Critical Risks</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color: #34d399;">${resolvedCount}</div>
      <div class="stat-label">Resolved in Tier</div>
    </div>
  `;

  if (countBadge) countBadge.textContent = `${filtered.length} Case${filtered.length === 1 ? '' : 's'}`;

  // Populate Table
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: var(--spacing-8); color: var(--color-text-muted);">
          No complaints found under the current filter for ${escapeHtml(currentRole)}.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const masked = maskIdentity(c, currentRole);
    return `
      <tr>
        <td>
          <div style="font-family: var(--font-family-mono); font-weight: 600; color: var(--color-primary-light);">
            ${escapeHtml(c.referenceId)}
          </div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">
            Group: <code>${escapeHtml(c.caseGroupId || 'Independent')}</code>
          </div>
        </td>

        <td>
          <div style="font-weight: 500;">${escapeHtml(c.category)}</div>
          <div style="display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;">
            ${renderSeverityBadge(c.severity)}
            ${renderUrgencyBadge(c.urgency)}
          </div>
        </td>

        <td style="font-size: 0.8rem; color: var(--color-text-secondary); white-space: nowrap;">
          ${new Date(c.dateTime).toLocaleDateString()}<br />
          <span style="font-size: 0.7rem; color: var(--color-text-muted);">${new Date(c.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </td>

        <td>
          <div class="masked-identity" style="${!masked.isMasked ? 'color: #34d399; background: rgba(16,185,129,0.1);' : ''}">
            ${masked.isMasked ? '🔒' : '👤'} ${escapeHtml(masked.displayText)}
          </div>
        </td>

        <td>
          <div>${renderAuthorityBadge(c.assignedAuthority)}</div>
          <div style="margin-top: 4px;">${renderRoutingOriginBadge(c.routingOrigin)}</div>
        </td>

        <td>
          ${renderStatusBadge(c.status)}
        </td>

        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 4px;">
            <button type="button" class="btn btn-secondary btn-sm btn-inspect" data-id="${escapeHtml(c.id)}" title="Inspect Full Complaint Details">
              👁️ Inspect
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-action" data-id="${escapeHtml(c.id)}" title="Update Case Status / Add Remarks">
              ✏️ Status
            </button>
            <button type="button" class="btn btn-danger btn-sm btn-override" data-id="${escapeHtml(c.id)}" title="Override Authority Routing / Escalate Tier">
              ⚡ Override
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Wire Action Buttons
  tbody.querySelectorAll('.btn-inspect').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openInspectModal(id);
    });
  });

  tbody.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openStatusModal(id);
    });
  });

  tbody.querySelectorAll('.btn-override').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openOverrideModal(id);
    });
  });
}

function openInspectModal(id) {
  const complaint = store.getComplaintById(id);
  if (!complaint) return;

  const masked = maskIdentity(complaint, currentRole);
  const auditLogs = complaint.auditLogs || [];

  const allInCase = complaint.caseGroupId 
    ? store.getComplaints().filter(c => (c.caseGroupId || '').trim() === (complaint.caseGroupId || '').trim())
    : [complaint];

  const content = `
    <div style="margin-bottom: var(--spacing-4);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
        <span style="font-size: 1.1rem; font-weight: 700; color: var(--color-primary-light);">
          Reference ID: ${escapeHtml(complaint.referenceId)}
        </span>
        <div style="display: flex; gap: 6px;">
          ${renderSeverityBadge(complaint.severity)}
          ${renderUrgencyBadge(complaint.urgency)}
          ${renderStatusBadge(complaint.status)}
        </div>
      </div>
      <div style="font-size: 0.8rem; color: var(--color-text-muted);">
        Verification PIN: <code>${escapeHtml(complaint.verificationPin)}</code> (Demo Key) | 
        Case Group: <code>${escapeHtml(complaint.caseGroupId || 'Independent')}</code> (${allInCase.length} Linked Reports)
      </div>
    </div>

    <!-- Rule-Based Risk Assessment Details (Refinement 3) -->
    <div style="background-color: rgba(6, 182, 212, 0.08); border-left: 3px solid var(--color-primary); padding: var(--spacing-4); border-radius: var(--radius-md); margin-bottom: var(--spacing-4); font-size: 0.85rem;">
      <div style="font-weight: 600; color: var(--color-primary-light); margin-bottom: 4px;">
        📊 Transparent Rule-Based Risk Assessment Explanation:
      </div>
      <div style="color: var(--color-text-primary); line-height: 1.5;">
        ${escapeHtml(complaint.severityReason || 'Standard procedural evaluation.')}
      </div>
      <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 6px;">
        Routing Mechanism: <strong>${escapeHtml(complaint.routingOrigin || 'Dual-Engine Triage')}</strong> &bull; Current Assigned Authority: <strong>${escapeHtml(complaint.assignedAuthority)}</strong>
      </div>
    </div>

    <!-- Reporter Identity Section -->
    <div style="background-color: var(--color-bg-surface); padding: var(--spacing-4); border-radius: var(--radius-md); margin-bottom: var(--spacing-4); border: 1px solid var(--color-border-subtle);">
      <h4 style="font-size: 0.85rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 6px;">
        Whistleblower Identity Assessment (${escapeHtml(currentRole)} View)
      </h4>
      <div style="font-size: 0.95rem; font-weight: 500;">
        ${escapeHtml(masked.displayText)}
      </div>
      <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
        Policy: ${escapeHtml(masked.tag)}
      </div>
    </div>

    <!-- Factual Narrative -->
    <div style="margin-bottom: var(--spacing-4);">
      <h4 style="font-size: 0.85rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px;">
        Incident Description
      </h4>
      <div style="background: var(--color-bg-surface); padding: var(--spacing-4); border-radius: var(--radius-md); font-size: 0.9rem; line-height: 1.6;">
        ${escapeHtml(complaint.description)}
      </div>
    </div>

    <!-- Suspect Info -->
    ${complaint.suspectName ? `
      <div style="margin-bottom: var(--spacing-4); background: var(--color-bg-surface); padding: var(--spacing-3) var(--spacing-4); border-radius: var(--radius-md); font-size: 0.85rem;">
        <strong>Reported Suspect:</strong> ${escapeHtml(complaint.suspectName)} 
        (${escapeHtml(complaint.suspectDepartment || 'Unspecified Dept')}) — 
        ${escapeHtml(complaint.suspectPhone || 'No contact')}
      </div>
    ` : ''}

    <!-- Linked Complaints in Case -->
    ${allInCase.length > 1 ? `
      <div style="margin-bottom: var(--spacing-4); background: rgba(244, 63, 94, 0.08); padding: var(--spacing-3) var(--spacing-4); border-radius: var(--radius-md); border: 1px solid rgba(244, 63, 94, 0.25);">
        <strong style="color: #fb7185; font-size: 0.85rem;">⚠️ Correlated Case Group (${allInCase.length} Reports Linked):</strong>
        <div style="font-size: 0.8rem; margin-top: 4px;">
          ${allInCase.map(m => `
            <div>• Ref <strong>${escapeHtml(m.referenceId)}</strong> (${escapeHtml(m.category)}) — Tier: ${escapeHtml(m.assignedAuthority)} | Status: ${escapeHtml(m.status)}</div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Audit Logs -->
    <div style="margin-top: var(--spacing-4);">
      <h4 style="font-size: 0.85rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px;">
        Append-Only Audit Trail
      </h4>
      <div class="timeline" style="margin-top: 8px;">
        ${auditLogs.map(l => `
          <div class="timeline-step completed">
            <div class="timeline-icon"></div>
            <div class="timeline-meta">${escapeHtml(l.displayTime || l.timestamp)}</div>
            <div class="timeline-title">${escapeHtml(l.action)} &rarr; ${escapeHtml(l.destination || 'N/A')}</div>
            <div class="timeline-desc"><strong>${escapeHtml(l.actor)}:</strong> ${escapeHtml(l.remarks)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  openModal({
    title: `Case File Details — ${complaint.referenceId}`,
    contentHtml: content,
    footerHtml: `<button type="button" class="btn btn-secondary" data-close-modal>Close</button>`
  });
}

function openStatusModal(id) {
  const complaint = store.getComplaintById(id);
  if (!complaint) return;

  const content = `
    <form id="form-update-status">
      <div class="form-group">
        <label class="form-label" for="select-new-status">Update Case Status</label>
        <select id="select-new-status" class="form-select">
          <option value="In Review" ${complaint.status === 'In Review' ? 'selected' : ''}>In Review</option>
          <option value="Under Investigation" ${complaint.status === 'Under Investigation' ? 'selected' : ''}>Under Investigation</option>
          <option value="Action Taken" ${complaint.status === 'Action Taken' ? 'selected' : ''}>Action Taken</option>
          <option value="Resolved" ${complaint.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="authority-remarks">
          Administrative Remarks <span class="required">*</span>
        </label>
        <textarea id="authority-remarks" class="form-textarea" rows="3" 
          placeholder="State investigative actions taken, committee notifications, or resolution notes..." required></textarea>
      </div>
    </form>
  `;

  const footer = `
    <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
    <button type="button" id="btn-save-status" class="btn btn-primary">Save Status Update</button>
  `;

  openModal({
    title: `Update Status — ${complaint.referenceId}`,
    contentHtml: content,
    footerHtml: footer
  });

  document.getElementById('btn-save-status')?.addEventListener('click', () => {
    const newStatus = document.getElementById('select-new-status').value;
    const remarks = document.getElementById('authority-remarks').value.trim();

    if (!remarks) {
      showToast('Please provide administrative remarks for the audit trail', 'error');
      return;
    }

    store.updateComplaintStatus(id, newStatus, remarks, currentRole);
    closeModal();
    updateDashboardContent();
    showToast(`Status updated to "${newStatus}" and logged in audit trail`, 'success');
  });
}

/**
 * Manual Routing Override Modal (Refinement 4)
 * Allows authorized roles to override routing or escalate to any tier,
 * strictly validating mandatory justification and blocking unauthorized downgrades.
 */
function openOverrideModal(id) {
  const complaint = store.getComplaintById(id);
  if (!complaint) return;

  const content = `
    <div style="margin-bottom: var(--spacing-4);">
      <p style="font-size: 0.9rem; margin-bottom: 8px;">
        Case Reference: <strong>${escapeHtml(complaint.referenceId)}</strong> | 
        Current Tier: <strong>${escapeHtml(complaint.assignedAuthority)}</strong> | 
        Severity: <strong>${escapeHtml(complaint.severity)}</strong>
      </p>
      <div class="alert alert-info" style="font-size: 0.8rem; margin-bottom: var(--spacing-4);">
        <div>ℹ️</div>
        <div>
          Automated routing acts as a rule-based recommendation. Authorized demo roles may re-assign or escalate tiers. 
          A detailed administrative justification is mandatory. Unauthorized downgrades of Critical incidents are strictly blocked.
        </div>
      </div>
    </div>

    <form id="form-override-routing">
      <div class="form-group">
        <label class="form-label" for="select-target-tier">Target Authority Tier <span class="required">*</span></label>
        <select id="select-target-tier" class="form-select">
          <option value="${AUTHORITY_TIERS.HOD}" ${complaint.assignedAuthority === AUTHORITY_TIERS.HOD ? 'selected' : ''}>🏢 Tier 1: HOD (Department Triage)</option>
          <option value="${AUTHORITY_TIERS.DEAN}" ${complaint.assignedAuthority === AUTHORITY_TIERS.DEAN ? 'selected' : ''}>🎓 Tier 2: Dean of Student Affairs</option>
          <option value="${AUTHORITY_TIERS.HIGHER_AUTH}" ${complaint.assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH ? 'selected' : ''}>⚖️ Tier 3: Higher Authority / Campus Ombudsperson</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="override-justification">
          Administrative Justification <span class="required">*</span>
        </label>
        <textarea id="override-justification" class="form-textarea" rows="3" 
          placeholder="Document the administrative rationale for routing override (minimum 15 characters)..." required minlength="15"></textarea>
        <span id="err-override-msg" class="form-error-msg"></span>
      </div>
    </form>
  `;

  const footer = `
    <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
    <button type="button" id="btn-confirm-override" class="btn btn-danger">Confirm Routing Override</button>
  `;

  openModal({
    title: `Manual Routing Override — ${complaint.referenceId}`,
    contentHtml: content,
    footerHtml: footer
  });

  document.getElementById('btn-confirm-override')?.addEventListener('click', () => {
    const targetTier = document.getElementById('select-target-tier').value;
    const reason = document.getElementById('override-justification').value.trim();
    const errMsg = document.getElementById('err-override-msg');
    errMsg.classList.remove('visible');

    const result = store.overrideComplaintRouting(id, targetTier, reason, currentRole);

    if (!result.success) {
      errMsg.textContent = result.error;
      errMsg.classList.add('visible');
      showToast(result.error, 'error');
      return;
    }

    closeModal();
    updateDashboardContent();
    showToast(`Case routing successfully overridden to ${targetTier}`, 'success');
  });
}
