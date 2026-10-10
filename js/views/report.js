/**
 * A.E.G.I.S — Incident Reporting View Component
 * Multi-section confidential incident submission form with validation,
 * independent severity & urgency indicators, reliable case group linking,
 * emergency guidance, and credentials receipt modal.
 */

import { store } from '../store.js';
import { validateEvidenceFile, escapeHtml } from '../security.js';
import { showToast, openModal, renderSeverityBadge, renderUrgencyBadge, copyToClipboard } from '../ui.js';

let pendingEvidenceMeta = null;

export function renderReportView() {
  const existingCases = store.getExistingCaseGroups();

  return `
    <div class="section-header">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <h1 class="section-title"><span>📢</span> Incident Grievance Portal</h1>
          <p class="section-subtitle">
            Submit a fictional demo report in anonymous, confidential-display, or standard mode.
            Dual-engine routing evaluates incident risk and linked case history.
          </p>
        </div>
        <!-- Quick Demo Autofill Bar for Hackathon Judges -->
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button type="button" id="btn-autofill-low" class="btn btn-secondary btn-sm" title="Low-Risk Independent -> HOD">
            🧪 Low-Risk (HOD)
          </button>
          <button type="button" id="btn-autofill-mod" class="btn btn-secondary btn-sm" title="Moderate-Risk Independent -> Dean">
            🧪 Moderate-Risk (Dean)
          </button>
          <button type="button" id="btn-autofill-crit" class="btn btn-secondary btn-sm" title="Critical-Risk Independent -> Bypasses to Higher Auth">
            🧪 Critical Bypass (Higher Auth)
          </button>
          <button type="button" id="btn-autofill-link-1" class="btn btn-secondary btn-sm" title="Linked Report 1 -> HOD">
            🧪 Linked #1 (CASE-BETA)
          </button>
          <button type="button" id="btn-autofill-link-2" class="btn btn-secondary btn-sm" title="Linked Report 2 -> Dean">
            🧪 Linked #2 (CASE-BETA)
          </button>
          <button type="button" id="btn-autofill-link-crit" class="btn btn-secondary btn-sm" title="High-Risk Linked -> Bumps CASE-BETA to Higher Auth">
            🧪 Linked High-Risk (Bumps Case)
          </button>
        </div>
      </div>
    </div>

    <div class="report-grid">
      <!-- Main Reporting Form -->
      <form id="incident-report-form" class="card" novalidate>

        <!-- Section 1: Incident Classification & Timing -->
        <div style="margin-bottom: var(--spacing-6);">
          <h3 style="font-size: 1.15rem; margin-bottom: var(--spacing-4); color: var(--color-primary-light);">
            1. Incident Nature & Classification
          </h3>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--spacing-4);">
            <div class="form-group">
              <label class="form-label" for="incident-type">Incident Environment <span class="required">*</span></label>
              <select id="incident-type" class="form-select" required>
                <option value="Offline (Campus)">Offline (Campus / Hostel / Lab / Classroom)</option>
                <option value="Online (Digital)">Online (Cyber / Chat / Messaging / Digital Platform)</option>
              </select>
              <span id="err-incident-type" class="form-error-msg">Please select an incident environment.</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="incident-category">Grievance Category <span class="required">*</span></label>
              <select id="incident-category" class="form-select" required>
                <option value="">-- Select Category --</option>
                <option value="Ragging & Physical Intimidation">Ragging & Physical Intimidation (High/Critical Base)</option>
                <option value="Physical Violence & Assault">Physical Violence & Assault (Critical Base)</option>
                <option value="Sexual Harassment & Coercion">Sexual Harassment & Coercion (Critical Base)</option>
                <option value="Hostel Harassment & Bullying">Hostel Harassment & Bullying (Moderate Base)</option>
                <option value="Laboratory Safety & Coercion">Laboratory Safety & Coercion (Moderate Base)</option>
                <option value="Cyber Harassment & Digital Abuse">Cyber Harassment & Digital Abuse (Moderate Base)</option>
                <option value="Academic Bias & Retaliation">Academic Bias & Retaliation (Moderate Base)</option>
                <option value="General Campus Grievance">General Campus Grievance (Low Base)</option>
                <option value="Other Campus Grievance">Other Campus Grievance (Low Base)</option>
              </select>
              <span id="err-incident-category" class="form-error-msg">Please select a grievance category.</span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--spacing-4);">
            <div class="form-group">
              <label class="form-label" for="incident-datetime">Date & Estimated Time <span class="required">*</span></label>
              <input type="datetime-local" id="incident-datetime" class="form-input" required />
              <span id="err-incident-datetime" class="form-error-msg">Please specify the date and time.</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="incident-location">Location / Platform <span class="required">*</span></label>
              <input type="text" id="incident-location" class="form-input" placeholder="e.g. Science Block Floor 2, or Discord Server" required />
              <span id="err-incident-location" class="form-error-msg">Location or platform is required.</span>
            </div>
          </div>

          <!-- Explicit Risk & Urgency Indicators Checklist (Refinements 1 & 2) -->
          <div style="background-color: var(--color-bg-surface); padding: var(--spacing-4); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); margin-top: var(--spacing-2);">
            <label class="form-label" style="margin-bottom: 6px; color: var(--color-primary-light);">
              Explicit Risk & Urgency Assessment Factors
            </label>
            <p class="form-hint" style="margin-bottom: var(--spacing-3);">
              Explicit risk signals take precedence over narrative keyword scanning to prevent false positives.
            </p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--spacing-2);">
              <label class="form-checkbox-label" style="padding: 6px 10px;">
                <input type="checkbox" id="risk-immediate" />
                <span style="font-size: 0.8rem;">🚨 Ongoing immediate physical danger / crisis</span>
              </label>
              <label class="form-checkbox-label" style="padding: 6px 10px;">
                <input type="checkbox" id="risk-physical" />
                <span style="font-size: 0.8rem;">⚠️ Credible threat of bodily injury or physical violence</span>
              </label>
              <label class="form-checkbox-label" style="padding: 6px 10px;">
                <input type="checkbox" id="risk-retaliation" />
                <span style="font-size: 0.8rem;">🛡️ Retaliation / Extortion by person in institutional power</span>
              </label>
              <label class="form-checkbox-label" style="padding: 6px 10px;">
                <input type="checkbox" id="risk-repeat" />
                <span style="font-size: 0.8rem;">🔁 Chronic repeat harassment or intimidation pattern</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Section 2: Narrative Description -->
        <div style="margin-bottom: var(--spacing-6); padding-top: var(--spacing-4); border-top: 1px solid var(--color-border-subtle);">
          <h3 style="font-size: 1.15rem; margin-bottom: var(--spacing-4); color: var(--color-primary-light);">
            2. Detailed Factual Description
          </h3>

          <div class="form-group">
            <label class="form-label" for="incident-description">
              Describe what occurred <span class="required">*</span>
            </label>
            <textarea id="incident-description" class="form-textarea" rows="4"
              placeholder="State the facts clearly. Mention any specific actions, words used, or sequence of events (minimum 20 characters)..."
              required minlength="20"></textarea>
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <span id="err-incident-description" class="form-error-msg">Description must be at least 20 characters.</span>
              <span id="char-count" class="form-hint">0 characters</span>
            </div>
          </div>
        </div>

        <!-- Section 3: Suspect Information (Optional) -->
        <div style="margin-bottom: var(--spacing-6); padding-top: var(--spacing-4); border-top: 1px solid var(--color-border-subtle);">
          <h3 style="font-size: 1.15rem; margin-bottom: var(--spacing-2); color: var(--color-primary-light);">
            3. Suspect Information <span style="font-size: 0.8rem; color: var(--color-text-muted); font-weight: normal;">(Optional — if known)</span>
          </h3>
          <p class="form-hint" style="margin-bottom: var(--spacing-3);">
            Note: Demonstrable escalation uses explicit case IDs, not automated fuzzy accusation.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-3);">
            <div class="form-group">
              <label class="form-label" for="suspect-name">Name / Identifier</label>
              <input type="text" id="suspect-name" class="form-input" placeholder="e.g. Lab Assistant / Student Name" />
            </div>
            <div class="form-group">
              <label class="form-label" for="suspect-dept">Department / Year</label>
              <input type="text" id="suspect-dept" class="form-input" placeholder="e.g. Mechanical Dept, 3rd Year" />
            </div>
            <div class="form-group">
              <label class="form-label" for="suspect-phone">Known Phone / Email</label>
              <input type="text" id="suspect-phone" class="form-input" placeholder="Optional contact info" />
            </div>
          </div>
        </div>

        <!-- Section 4: Demo Case Correlation / Linking Engine (Refinement 5) -->
        <div style="margin-bottom: var(--spacing-6); padding-top: var(--spacing-4); border-top: 1px solid var(--color-border-subtle);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-2);">
            <h3 style="font-size: 1.15rem; margin: 0; color: var(--color-primary-light);">
              4. Escalation Case Linking Engine
            </h3>
            <span class="badge badge-demo">Reliable Case Sync</span>
          </div>
          <p class="form-hint" style="margin-bottom: var(--spacing-3);">
            Choose whether to link this complaint to an existing case group or file independently.
            Linked reports reliably synchronize without accidental unlinking.
          </p>

          <!-- Explicit linking mode selector to prevent race conditions or dropped links -->
          <div class="form-radio-group" style="margin-bottom: var(--spacing-3);">
            <label class="form-radio-card" style="padding: 8px 12px;">
              <input type="radio" name="case-link-mode" value="independent" checked />
              <div class="radio-content">
                <strong>File as Independent Complaint</strong>
                <span class="form-hint">No case linking. Evaluated solely on incident severity.</span>
              </div>
            </label>

            <label class="form-radio-card" style="padding: 8px 12px;">
              <input type="radio" name="case-link-mode" value="link-existing" />
              <div class="radio-content">
                <strong>Link to Existing Case Group</strong>
                <span class="form-hint">Correlates with existing reports and triggers multi-report escalation.</span>
              </div>
            </label>

            <label class="form-radio-card" style="padding: 8px 12px;">
              <input type="radio" name="case-link-mode" value="create-custom" />
              <div class="radio-content">
                <strong>Create New Case Group Identifier</strong>
                <span class="form-hint">Define a new case tag (e.g. CASE-HOSTEL-02) for subsequent linked reports.</span>
              </div>
            </label>
          </div>

          <div id="case-link-existing-controls" style="display: none; margin-bottom: var(--spacing-3);">
            <label class="form-label" for="link-case-select">Select Target Case Group <span class="required">*</span></label>
            <select id="link-case-select" class="form-select">
              <option value="CASE-ALPHA">⭐ CASE-ALPHA (Demo Escalation Group)</option>
              <option value="CASE-BETA">⭐ CASE-BETA (Fresh Chain Test Group)</option>
              ${existingCases.filter(c => c !== 'CASE-ALPHA' && c !== 'CASE-BETA').map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>

          <div id="case-link-custom-controls" style="display: none; margin-bottom: var(--spacing-3);">
            <label class="form-label" for="custom-case-id">Enter Custom Case Group ID <span class="required">*</span></label>
            <input type="text" id="custom-case-id" class="form-input" placeholder="e.g. CASE-WING-4" />
          </div>
        </div>

        <!-- Section 5: Confidentiality & Reporter Identity -->
        <div style="margin-bottom: var(--spacing-6); padding-top: var(--spacing-4); border-top: 1px solid var(--color-border-subtle);">
          <h3 style="font-size: 1.15rem; margin-bottom: var(--spacing-2); color: var(--color-primary-light);">
            5. Confidentiality & Identity Preference <span class="required">*</span>
          </h3>
          <p class="form-hint" style="margin-bottom: var(--spacing-3);">
            Select how your identity should be protected across administrative tiers.
          </p>

          <div class="form-radio-group">
            <label class="form-radio-card">
              <input type="radio" name="identity-mode" value="anonymous" checked />
              <div class="radio-content">
                <strong>🔒 Anonymous Reporting (Zero Identity Recorded)</strong>
                <p style="font-size: 0.8rem; margin: 2px 0 0; color: var(--color-text-secondary);">
                  No name or contact information is collected or stored. No authority tier can view your identity.
                </p>
              </div>
            </label>

            <label class="form-radio-card">
              <input type="radio" name="identity-mode" value="confidential" />
              <div class="radio-content">
                <strong>🛡️ Confidential Whistleblower (Masked from HOD & Dean)</strong>
                <p style="font-size: 0.8rem; margin: 2px 0 0; color: var(--color-text-secondary);">
                  Your contact details are recorded for investigation follow-up, but strictly <strong>masked</strong>
                  from Department HOD and Dean displays. Only Higher Authority (Tier 3) may access contact details.
                </p>
              </div>
            </label>

            <label class="form-radio-card">
              <input type="radio" name="identity-mode" value="standard" />
              <div class="radio-content">
                <strong>👤 Standard Open Reporting</strong>
                <p style="font-size: 0.8rem; margin: 2px 0 0; color: var(--color-text-secondary);">
                  Your name and contact details are visible to all assigned investigation authorities.
                </p>
              </div>
            </label>
          </div>

          <!-- Dynamic Identity Fields Container -->
          <div id="reporter-fields-box" style="display: none; margin-top: var(--spacing-4); padding: var(--spacing-4); background-color: var(--color-bg-surface); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle);">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-3);">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="reporter-name">Your Full Name <span class="required">*</span></label>
                <input type="text" id="reporter-name" class="form-input" placeholder="e.g. Priya Nair" />
                <span id="err-reporter-name" class="form-error-msg">Reporter name is required in this mode.</span>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="reporter-contact">Your Phone or Email <span class="required">*</span></label>
                <input type="text" id="reporter-contact" class="form-input" placeholder="e.g. priya@campus.edu or 9876543210" />
                <span id="err-reporter-contact" class="form-error-msg">Contact detail is required in this mode.</span>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="reporter-dept">Department / Semester</label>
                <input type="text" id="reporter-dept" class="form-input" placeholder="e.g. BioTech 3rd Sem" />
              </div>
            </div>
          </div>
        </div>

        <!-- Section 6: Optional Evidence Attachment -->
        <div style="margin-bottom: var(--spacing-6); padding-top: var(--spacing-4); border-top: 1px solid var(--color-border-subtle);">
          <h3 style="font-size: 1.15rem; margin-bottom: var(--spacing-2); color: var(--color-primary-light);">
            6. Evidence Attachment <span style="font-size: 0.8rem; color: var(--color-text-muted); font-weight: normal;">(Optional)</span>
          </h3>
          <p class="form-hint" style="margin-bottom: var(--spacing-3);">
            Supported formats: JPG, PNG, WEBP, PDF (Max file size: 5 MB).
          </p>

          <div id="file-dropzone" class="file-dropzone" tabindex="0" role="button" aria-label="Upload evidence file">
            <div style="font-size: 2rem; margin-bottom: 8px;">📎</div>
            <p style="margin: 0; font-weight: 500; color: var(--color-text-primary);">
              Click here to select a demo evidence file
            </p>
            <span class="form-hint">Client-side demonstration preview only.</span>
            <input type="file" id="evidence-input" accept=".jpg,.jpeg,.png,.webp,.pdf" />
          </div>

          <div id="file-preview-container" style="display: none;"></div>
          <span id="err-evidence-file" class="form-error-msg"></span>
        </div>

        <!-- Emergency Guidance Notice (Refinement 3) -->
        <div id="emergency-guidance-banner" class="alert alert-danger" style="display: none; margin-bottom: var(--spacing-6);">
          <div style="font-size: 1.5rem;">🆘</div>
          <div>
            <strong>High-Risk Emergency Guidance:</strong>
            <p style="margin: 4px 0 0; font-size: 0.85rem; color: inherit;">
              Critical signals or imminent hazard indicators are active.
              If you are in immediate physical danger, contact Emergency Services (<strong>112</strong>) or National Women Helpline (<strong>1091</strong>).
              This report will automatically bypass lower departmental tiers for direct Higher Authority review.
            </p>
          </div>
        </div>

        <!-- Submit Button -->
        <div>
          <button type="submit" id="btn-submit-report" class="btn btn-primary btn-lg btn-block">
            <span>🛡️</span> Submit Incident Report
          </button>
          <p class="form-hint" style="text-align: center; margin-top: var(--spacing-3);">
            By submitting, you acknowledge the information provided is accurate to the best of your knowledge.
          </p>
        </div>
      </form>

      <!-- Sidebar Guidance -->
      <aside class="guidance-sidebar">
        <div class="info-card">
          <h4><span>⚡</span> Dual-Engine Routing</h4>
          <p style="font-size: 0.8rem; line-height: 1.5; margin: 0;">
            A.E.G.I.S computes:<br />
            <code>Final Tier = MAX(Severity, Repeat, Case Tier)</code><br />
            Critical complaints bypass lower tiers immediately. Cases never automatically downgrade.
          </p>
        </div>

        <div class="info-card">
          <h4><span>🔒</span> Demo Identity Display Rules</h4>
          <p style="font-size: 0.8rem; margin: 0;">
            In confidential mode, HOD and Dean screens mask identity; Higher Authority screens display it. Browser storage still contains the record. This is not access control.
          </p>
        </div>

        <div class="info-card">
          <h4><span>🔑</span> Save Your Credentials</h4>
          <p style="font-size: 0.8rem; margin: 0;">
            Every filing generates a Reference ID (e.g. <code>AEG-2026-X7K2</code>) and 6-digit PIN. Both are required to track status.
          </p>
        </div>
      </aside>
    </div>
  `;
}

export function initReportView() {
  const form = document.getElementById('incident-report-form');
  if (!form) return;

  const descInput = document.getElementById('incident-description');
  const charCount = document.getElementById('char-count');
  const radioModeButtons = document.querySelectorAll('input[name="identity-mode"]');
  const reporterFieldsBox = document.getElementById('reporter-fields-box');
  const fileDropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('evidence-input');
  const filePreview = document.getElementById('file-preview-container');

  // Case link mode radio elements
  const caseLinkRadios = document.querySelectorAll('input[name="case-link-mode"]');
  const linkExistingControls = document.getElementById('case-link-existing-controls');
  const linkCustomControls = document.getElementById('case-link-custom-controls');
  const linkCaseSelect = document.getElementById('link-case-select');
  const customCaseInput = document.getElementById('custom-case-id');

  // Risk checkboxes & emergency banner
  const riskImmediate = document.getElementById('risk-immediate');
  const riskPhysical = document.getElementById('risk-physical');
  const categorySelect = document.getElementById('incident-category');
  const emergencyBanner = document.getElementById('emergency-guidance-banner');

  pendingEvidenceMeta = null;

  // Emergency banner visibility logic
  const checkEmergencyState = () => {
    const isImm = riskImmediate && riskImmediate.checked;
    const isPhys = riskPhysical && riskPhysical.checked;
    const cat = categorySelect ? categorySelect.value : '';
    const isCritCat = cat.includes('Violence') || cat.includes('Sexual') || cat.includes('Ragging');

    if (isImm || isPhys || isCritCat) {
      if (emergencyBanner) emergencyBanner.style.display = 'flex';
    } else {
      if (emergencyBanner) emergencyBanner.style.display = 'none';
    }
  };

  [riskImmediate, riskPhysical, categorySelect].forEach(el => {
    if (el) el.addEventListener('change', checkEmergencyState);
  });

  // Character counter
  if (descInput && charCount) {
    descInput.addEventListener('input', () => {
      const len = descInput.value.length;
      charCount.textContent = `${len} character${len === 1 ? '' : 's'}`;
    });
  }

  // Toggle identity fields
  radioModeButtons.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'anonymous') {
        reporterFieldsBox.style.display = 'none';
      } else {
        reporterFieldsBox.style.display = 'block';
      }
    });
  });

  // Case link mode toggles
  caseLinkRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'link-existing') {
        linkExistingControls.style.display = 'block';
        linkCustomControls.style.display = 'none';
      } else if (radio.value === 'create-custom') {
        linkExistingControls.style.display = 'none';
        linkCustomControls.style.display = 'block';
      } else {
        linkExistingControls.style.display = 'none';
        linkCustomControls.style.display = 'none';
      }
    });
  });

  // File dropzone click
  if (fileDropzone && fileInput) {
    fileDropzone.addEventListener('click', () => fileInput.click());
    fileDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const errEl = document.getElementById('err-evidence-file');
      errEl.classList.remove('visible');
      filePreview.style.display = 'none';

      if (!file) {
        pendingEvidenceMeta = null;
        return;
      }

      const validation = await validateEvidenceFile(file);
      if (!validation.valid) {
        errEl.textContent = validation.error;
        errEl.classList.add('visible');
        pendingEvidenceMeta = null;
        fileInput.value = '';
        return;
      }

      pendingEvidenceMeta = validation.fileMeta;
      filePreview.innerHTML = `
        <div class="file-preview">
          <div>
            <strong>📄 ${escapeHtml(file.name)}</strong>
            <span style="color: var(--color-text-muted); font-size: 0.75rem; margin-left: 8px;">
              (${validation.fileMeta.sizeFormatted}) — Ready for demo
            </span>
          </div>
          <button type="button" id="btn-remove-file" class="btn-close" title="Remove attachment">&times;</button>
        </div>
      `;
      filePreview.style.display = 'block';

      document.getElementById('btn-remove-file')?.addEventListener('click', () => {
        pendingEvidenceMeta = null;
        fileInput.value = '';
        filePreview.style.display = 'none';
      });
    });
  }

  // Quick Autofill buttons for judges / demonstration
  const setFormValues = ({ category, location, desc, suspect, caseMode, caseId, flags = {} }) => {
    if (categorySelect) categorySelect.value = category;
    document.getElementById('incident-datetime').value = new Date().toISOString().slice(0, 16);
    document.getElementById('incident-location').value = location;
    document.getElementById('incident-description').value = desc;
    document.getElementById('suspect-name').value = suspect || '';

    // Set checkboxes
    document.getElementById('risk-immediate').checked = !!flags.immediateDanger;
    document.getElementById('risk-physical').checked = !!flags.physicalThreat;
    document.getElementById('risk-retaliation').checked = !!flags.retaliation;
    document.getElementById('risk-repeat').checked = !!flags.repeatHarassment;

    // Set case mode
    const targetRadio = document.querySelector(`input[name="case-link-mode"][value="${caseMode}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
      targetRadio.dispatchEvent(new Event('change'));
    }
    if (caseMode === 'link-existing' && linkCaseSelect && caseId) {
      linkCaseSelect.value = caseId;
    }
    if (caseMode === 'create-custom' && customCaseInput && caseId) {
      customCaseInput.value = caseId;
    }

    descInput.dispatchEvent(new Event('input'));
    checkEmergencyState();
  };

  // 1. Low-Risk Independent -> HOD
  document.getElementById('btn-autofill-low')?.addEventListener('click', () => {
    setFormValues({
      category: 'General Campus Grievance',
      location: 'Central Library Study Room 4',
      desc: 'Noise disturbance and scheduling dispute regarding reserved project study carrels during evening hours.',
      suspect: 'Third-party study group',
      caseMode: 'independent',
      flags: {}
    });
    showToast('Autofilled: Low-Risk Independent Complaint (Expected: HOD)', 'info');
  });

  // 2. Moderate-Risk Independent -> Dean
  document.getElementById('btn-autofill-mod')?.addEventListener('click', () => {
    setFormValues({
      category: 'Hostel Harassment & Bullying',
      location: 'Hostel Block C, Floor 2 Corridor',
      desc: 'Repeated late-night hostel curfew intimidation and forced room cleaning demands targeting junior residents.',
      suspect: 'Senior Hostel Residents',
      caseMode: 'independent',
      flags: { repeatHarassment: true }
    });
    showToast('Autofilled: Moderate-Risk Independent Complaint (Expected: Dean)', 'info');
  });

  // 3. Critical-Risk Independent -> Bypasses to Higher Auth
  document.getElementById('btn-autofill-crit')?.addEventListener('click', () => {
    setFormValues({
      category: 'Physical Violence & Assault',
      location: 'South Campus Ground / Parking Zone',
      desc: 'Direct physical assault and weapon threats outside parking lot. Severe bleeding and physical harm threatened if reported.',
      suspect: 'Out-of-campus associates',
      caseMode: 'independent',
      flags: { immediateDanger: true, physicalThreat: true, retaliation: true }
    });
    showToast('Autofilled: Critical-Risk Complaint (Expected: Immediate Bypass to Higher Auth)', 'warning');
  });

  // 4. Linked Report 1 (CASE-BETA) -> HOD
  document.getElementById('btn-autofill-link-1')?.addEventListener('click', () => {
    setFormValues({
      category: 'General Campus Grievance',
      location: 'Engineering Department Lab Corridor',
      desc: 'Report #1 for CASE-BETA: Unfair equipment allocation dispute and minor verbal confrontation.',
      suspect: 'Lab Representative',
      caseMode: 'link-existing',
      caseId: 'CASE-BETA',
      flags: {}
    });
    showToast('Autofilled: Report #1 in CASE-BETA (Expected: HOD)', 'info');
  });

  // 5. Linked Report 2 (CASE-BETA) -> Dean
  document.getElementById('btn-autofill-link-2')?.addEventListener('click', () => {
    setFormValues({
      category: 'General Campus Grievance',
      location: 'Engineering Department Lab Corridor',
      desc: 'Report #2 for CASE-BETA: Second student lodging complaint against the same equipment withholding.',
      suspect: 'Lab Representative',
      caseMode: 'link-existing',
      caseId: 'CASE-BETA',
      flags: {}
    });
    showToast('Autofilled: Report #2 in CASE-BETA (Expected: Auto-Escalation to Dean)', 'info');
  });

  // 6. High-Risk Linked Report -> Bumps entire CASE-BETA to Higher Auth
  document.getElementById('btn-autofill-link-crit')?.addEventListener('click', () => {
    setFormValues({
      category: 'Ragging & Physical Intimidation',
      location: 'Engineering Department Basement',
      desc: 'Report for CASE-BETA with physical violence threat: Suspect threatened severe physical retaliation if prior complaints are not withdrawn.',
      suspect: 'Lab Representative',
      caseMode: 'link-existing',
      caseId: 'CASE-BETA',
      flags: { physicalThreat: true, retaliation: true }
    });
    showToast('Autofilled: High-Risk Linked Report (Expected: Bumps CASE-BETA to Higher Auth)', 'warning');
  });

  // Form submit handler with validation
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    let isValid = true;
    const hideErr = (id) => document.getElementById(id)?.classList.remove('visible');
    const showErr = (id, msg) => {
      const el = document.getElementById(id);
      if (el) {
        if (msg) el.textContent = msg;
        el.classList.add('visible');
      }
      isValid = false;
    };

    ['err-incident-category', 'err-incident-datetime', 'err-incident-location', 'err-incident-description', 'err-reporter-name', 'err-reporter-contact'].forEach(hideErr);

    const category = document.getElementById('incident-category').value;
    const dateTime = document.getElementById('incident-datetime').value;
    const location = document.getElementById('incident-location').value.trim();
    const description = document.getElementById('incident-description').value.trim();
    const identityMode = document.querySelector('input[name="identity-mode"]:checked')?.value || 'anonymous';

    if (!category) showErr('err-incident-category');
    if (!dateTime) showErr('err-incident-datetime');
    if (!location) showErr('err-incident-location');
    if (!description || description.length < 20) showErr('err-incident-description');

    let reporterName = '';
    let reporterContact = '';
    let reporterDept = '';

    if (identityMode !== 'anonymous') {
      reporterName = document.getElementById('reporter-name').value.trim();
      reporterContact = document.getElementById('reporter-contact').value.trim();
      reporterDept = document.getElementById('reporter-dept').value.trim();

      if (!reporterName) showErr('err-reporter-name');
      if (!reporterContact) showErr('err-reporter-contact');
    }

    if (!isValid) {
      showToast('Please resolve the highlighted validation errors.', 'error');
      return;
    }

    // Reliably resolve case group ID
    const caseMode = document.querySelector('input[name="case-link-mode"]:checked')?.value || 'independent';
    let resolvedCaseGroupId = '';
    if (caseMode === 'link-existing') {
      resolvedCaseGroupId = (linkCaseSelect?.value || 'CASE-ALPHA').trim().toUpperCase();
    } else if (caseMode === 'create-custom') {
      resolvedCaseGroupId = (customCaseInput?.value || '').trim().toUpperCase();
    }

    // Collect risk flags
    const riskFlags = {
      immediateDanger: !!document.getElementById('risk-immediate')?.checked,
      physicalThreat: !!document.getElementById('risk-physical')?.checked,
      retaliation: !!document.getElementById('risk-retaliation')?.checked,
      repeatHarassment: !!document.getElementById('risk-repeat')?.checked
    };

    // Prepare payload
    const payload = {
      incidentType: document.getElementById('incident-type').value,
      category,
      dateTime,
      location,
      description,
      suspectName: document.getElementById('suspect-name').value.trim(),
      suspectDepartment: document.getElementById('suspect-dept').value.trim(),
      suspectPhone: document.getElementById('suspect-phone').value.trim(),
      identityMode,
      reporterName,
      reporterContact,
      reporterDepartment: reporterDept,
      caseGroupId: resolvedCaseGroupId,
      riskFlags,
      evidenceFile: pendingEvidenceMeta
    };

    let saved;
    try { saved = store.saveComplaint(payload); }
    catch (error) { showToast(error.message, 'error', 0); return; }

    // Show Confirmation Modal
    const modalContent = `
      <div style="text-align: center; margin-bottom: var(--spacing-4);">
        <div style="font-size: 3rem; margin-bottom: 8px;">✅</div>
        <h3 style="color: #34d399; margin-bottom: 4px;">Incident Report Successfully Registered</h3>
        <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin: 0;">
          Save these dual credentials to monitor investigation progress and escalation logs.
        </p>
      </div>

      <div class="ref-code-display">
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; margin-bottom: 4px;">
          Complaint Reference ID
        </div>
        <div class="ref-code-val" id="modal-ref-id">${escapeHtml(saved.referenceId)}</div>
        <button type="button" id="btn-copy-ref" class="btn btn-secondary btn-sm" style="margin-top: 8px;">
          📋 Copy Reference ID
        </button>
      </div>

      <div class="ref-code-display" style="border-color: #f59e0b; background-color: rgba(245, 158, 11, 0.05);">
        <div style="font-size: 0.75rem; text-transform: uppercase; color: #fbbf24; letter-spacing: 0.05em; margin-bottom: 4px;">
          6-Digit Demo Verification PIN <span class="badge badge-demo" style="font-size: 0.65rem;">Demo Only</span>
        </div>
        <div class="ref-code-val" style="color: #fbbf24;" id="modal-pin">${escapeHtml(saved.verificationPin)}</div>
        <button type="button" id="btn-copy-pin" class="btn btn-secondary btn-sm" style="margin-top: 8px;">
          📋 Copy Verification PIN
        </button>
      </div>

      <div style="background-color: var(--color-bg-surface); padding: var(--spacing-4); border-radius: var(--radius-md); font-size: 0.85rem; margin-top: var(--spacing-4); border: 1px solid var(--color-border-subtle);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="color: var(--color-text-muted);">Assigned Authority Tier:</span>
          <strong>${escapeHtml(saved.assignedAuthority)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="color: var(--color-text-muted);">Assessed Severity & Urgency:</span>
          <div>
            ${renderSeverityBadge(saved.severity)}
            ${renderUrgencyBadge(saved.urgency)}
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="color: var(--color-text-muted);">Routing Origin:</span>
          <code>${escapeHtml(saved.routingOrigin || 'Dual-Engine Triage')}</code>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="color: var(--color-text-muted);">Case Group Link:</span>
          <code>${escapeHtml(saved.caseGroupId || 'Independent (No Group)')}</code>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="color: var(--color-text-muted);">Confidentiality Mode:</span>
          <span>${saved.identityMode === 'anonymous' ? '🔒 Anonymous' : (saved.identityMode === 'confidential' ? '🛡️ Confidential' : '👤 Standard')}</span>
        </div>
        <div style="background: rgba(6,182,212,0.06); padding: 8px; border-radius: 4px; font-size: 0.8rem; color: var(--color-text-secondary); border-left: 3px solid var(--color-primary);">
          <strong>Risk Assessment Note:</strong> ${escapeHtml(saved.severityReason)}
        </div>
      </div>
    `;

    const modalFooter = `
      <button type="button" class="btn btn-secondary" data-close-modal>Close</button>
      <a href="#track" class="btn btn-primary" id="btn-goto-track">Track This Complaint Now &rarr;</a>
    `;

    openModal({
      title: 'Submission Receipt — A.E.G.I.S',
      contentHtml: modalContent,
      footerHtml: modalFooter,
      onClose: () => {
        form.reset();
        pendingEvidenceMeta = null;
        descInput.dispatchEvent(new Event('input'));
        checkEmergencyState();
        radioModeButtons.forEach(radio => { if (radio.checked) radio.dispatchEvent(new Event('change')); });
        caseLinkRadios.forEach(radio => { if (radio.checked) radio.dispatchEvent(new Event('change')); });
        fileInput.value = '';
        filePreview.style.display = 'none';
      }
    });

    // Wire copy buttons
    document.getElementById('btn-copy-ref')?.addEventListener('click', () => {
      copyToClipboard(saved.referenceId, 'Reference ID');
    });

    document.getElementById('btn-copy-pin')?.addEventListener('click', () => {
      copyToClipboard(saved.verificationPin, 'Verification PIN');
    });

    document.getElementById('btn-goto-track')?.addEventListener('click', () => {
      try {
        sessionStorage.setItem('aegis_prefill_ref', saved.referenceId);
        sessionStorage.setItem('aegis_prefill_pin', saved.verificationPin);
      } catch { showToast('Automatic tracking prefill unavailable. Enter the receipt credentials manually.', 'warning'); }
    });

    showToast('Incident report logged successfully!', 'success');
  });
}
