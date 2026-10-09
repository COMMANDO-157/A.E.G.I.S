/**
 * A.E.G.I.S — Incident Reporting View Component
 * Multi-section confidential incident submission form with validation,
 * case linking, evidence checking, and confirmation credentials modal.
 */

import { store } from '../store.js';
import { validateEvidenceFile, escapeHtml } from '../security.js';
import { showToast, openModal } from '../ui.js';

let pendingEvidenceMeta = null;

export function renderReportView() {
  const existingCases = store.getExistingCaseGroups();

  return `
    <div class="section-header">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <h1 class="section-title"><span>📢</span> Incident Grievance Portal</h1>
          <p class="section-subtitle">
            Submit an encrypted, confidential, or anonymous incident report. 
            All submissions generate a unique Reference ID and a 6-digit demo verification PIN.
          </p>
        </div>
        <!-- Quick Demo Autofill Bar for Hackathon Judges -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="btn-autofill-case-1" class="btn btn-secondary btn-sm" title="Fills report #1 for CASE-ALPHA">
            🧪 Demo: File Report #1 (HOD)
          </button>
          <button type="button" id="btn-autofill-case-2" class="btn btn-secondary btn-sm" title="Fills report #2 for CASE-ALPHA">
            🧪 Demo: File Report #2 (Dean)
          </button>
          <button type="button" id="btn-autofill-case-3" class="btn btn-secondary btn-sm" title="Fills report #3 for CASE-ALPHA">
            🧪 Demo: File Report #3 (Higher Auth)
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
                <option value="Ragging & Physical Intimidation">Ragging & Physical Intimidation</option>
                <option value="Hostel Harassment & Bullying">Hostel Harassment & Bullying</option>
                <option value="Cyber Harassment & Digital Abuse">Cyber Harassment & Digital Abuse</option>
                <option value="Laboratory Safety & Coercion">Laboratory Safety & Coercion</option>
                <option value="Academic Bias & Retaliation">Academic Bias & Retaliation</option>
                <option value="Other Campus Grievance">Other Campus Grievance</option>
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

        <!-- Section 4: Demo Case Correlation / Linking Engine -->
        <div style="margin-bottom: var(--spacing-6); padding-top: var(--spacing-4); border-top: 1px solid var(--color-border-subtle);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-2);">
            <h3 style="font-size: 1.15rem; margin: 0; color: var(--color-primary-light);">
              4. Escalation Case Linking <span class="badge badge-demo">Demo Feature</span>
            </h3>
          </div>
          <p class="form-hint" style="margin-bottom: var(--spacing-3);">
            To demonstrate multi-tier escalation (1st: HOD → 2nd: Dean → 3rd+: Higher Authority), 
            you can link this report to an existing case group or start a new case group.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-3);">
            <div class="form-group">
              <label class="form-label" for="link-case-select">Link to Existing Demo Case</label>
              <select id="link-case-select" class="form-select">
                <option value="">-- Start New Independent Case --</option>
                <option value="CASE-ALPHA">⭐ CASE-ALPHA (For Escalation Test)</option>
                ${existingCases.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="custom-case-id">Or Specify Custom Case Group ID</label>
              <input type="text" id="custom-case-id" class="form-input" placeholder="e.g. CASE-HOSTEL-02" />
            </div>
          </div>
        </div>

        <!-- Section 5: Confidentiality & Reporter Identity (Refinement 1) -->
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
        <div style="margin-bottom: var(--spacing-8); padding-top: var(--spacing-4); border-top: 1px solid var(--color-border-subtle);">
          <h3 style="font-size: 1.15rem; margin-bottom: var(--spacing-2); color: var(--color-primary-light);">
            6. Evidence Attachment <span style="font-size: 0.8rem; color: var(--color-text-muted); font-weight: normal;">(Optional)</span>
          </h3>
          <p class="form-hint" style="margin-bottom: var(--spacing-3);">
            Supported formats: JPG, PNG, WEBP, PDF (Max file size: 5 MB).
          </p>

          <div id="file-dropzone" class="file-dropzone" tabindex="0" role="button" aria-label="Upload evidence file">
            <div style="font-size: 2rem; margin-bottom: 8px;">📎</div>
            <p style="margin: 0; font-weight: 500; color: var(--color-text-primary);">
              Click or drag file here to attach evidence
            </p>
            <span class="form-hint">Client-side demonstration preview only.</span>
            <input type="file" id="evidence-input" accept=".jpg,.jpeg,.png,.webp,.pdf" />
          </div>

          <div id="file-preview-container" style="display: none;"></div>
          <span id="err-evidence-file" class="form-error-msg"></span>
        </div>

        <!-- Submit Button -->
        <div>
          <button type="submit" id="btn-submit-report" class="btn btn-primary btn-lg btn-block">
            <span>🛡️</span> Submit Incident Report Securely
          </button>
          <p class="form-hint" style="text-align: center; margin-top: var(--spacing-3);">
            By submitting, you acknowledge that this is a competition demonstration prototype.
          </p>
        </div>
      </form>

      <!-- Sidebar Guidance -->
      <aside class="guidance-sidebar">
        <div class="info-card">
          <h4><span>🔒</span> Zero-Retaliation Policy</h4>
          <p>
            A.E.G.I.S employs cryptographic-style procedural separation: 
            Departmental heads cannot access identity records in confidential mode.
          </p>
        </div>

        <div class="info-card">
          <h4><span>⏱️</span> Escalation SLA Thresholds</h4>
          <ul style="padding-left: 18px; font-size: 0.8rem; margin: 0;">
            <li><strong>1st Complaint:</strong> Evaluated by HOD.</li>
            <li><strong>2nd Complaint in Case:</strong> Auto-escalated to Dean.</li>
            <li><strong>3rd+ Complaints:</strong> Escalate to Higher Authority.</li>
          </ul>
        </div>

        <div class="info-card">
          <h4><span>🔑</span> Save Your Credentials</h4>
          <p>
            Upon submission, you will be issued a <strong>Reference ID</strong> and a separate 
            <strong>6-digit demo verification PIN</strong>. Both are required to track status.
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
  const linkCaseSelect = document.getElementById('link-case-select');
  const customCaseInput = document.getElementById('custom-case-id');

  // Reset evidence state
  pendingEvidenceMeta = null;

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

  // Sync case group select and input
  if (linkCaseSelect && customCaseInput) {
    linkCaseSelect.addEventListener('change', () => {
      if (linkCaseSelect.value) {
        customCaseInput.value = linkCaseSelect.value;
      }
    });
  }

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
  const setupAutofill = (btnId, caseId, category, textPrefix) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.getElementById('incident-category').value = category;
      document.getElementById('incident-datetime').value = new Date().toISOString().slice(0, 16);
      document.getElementById('incident-location').value = 'East Hostel Corridor / Common Room';
      document.getElementById('incident-description').value = `${textPrefix}: Witnessed senior students intimidating juniors after campus curfew hours. Physical confrontation threatened.`;
      document.getElementById('suspect-name').value = 'Target Group Leader';
      document.getElementById('suspect-dept').value = 'Mechanical Engineering 4th Year';
      if (customCaseInput) customCaseInput.value = caseId;
      if (linkCaseSelect) linkCaseSelect.value = caseId;
      descInput.dispatchEvent(new Event('input'));
      showToast(`Autofilled demo data for case ${caseId}!`, 'info');
    });
  };

  setupAutofill('btn-autofill-case-1', 'CASE-ALPHA', 'Hostel Harassment & Bullying', 'Incident Report 1 of 3');
  setupAutofill('btn-autofill-case-2', 'CASE-ALPHA', 'Hostel Harassment & Bullying', 'Incident Report 2 of 3 (Should trigger auto-escalation to Dean)');
  setupAutofill('btn-autofill-case-3', 'CASE-ALPHA', 'Hostel Harassment & Bullying', 'Incident Report 3 of 3 (Should trigger auto-escalation to Higher Authority)');

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

    const caseGroupId = (customCaseInput?.value || linkCaseSelect?.value || '').trim().toUpperCase();

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
      caseGroupId,
      evidenceFile: pendingEvidenceMeta
    };

    const saved = store.saveComplaint(payload);

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

      <div style="background-color: var(--color-bg-surface); padding: var(--spacing-3); border-radius: var(--radius-md); font-size: 0.85rem; margin-top: var(--spacing-4);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="color: var(--color-text-muted);">Assigned Authority Tier:</span>
          <strong>${escapeHtml(saved.assignedAuthority)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="color: var(--color-text-muted);">Demo Case Group:</span>
          <code>${escapeHtml(saved.caseGroupId || 'Independent (No Group)')}</code>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--color-text-muted);">Confidentiality Mode:</span>
          <span>${saved.identityMode === 'anonymous' ? '🔒 Anonymous' : (saved.identityMode === 'confidential' ? '🛡️ Confidential' : '👤 Standard')}</span>
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
      }
    });

    // Wire copy buttons
    document.getElementById('btn-copy-ref')?.addEventListener('click', () => {
      navigator.clipboard.writeText(saved.referenceId);
      showToast('Reference ID copied!', 'success');
    });

    document.getElementById('btn-copy-pin')?.addEventListener('click', () => {
      navigator.clipboard.writeText(saved.verificationPin);
      showToast('Verification PIN copied!', 'success');
    });

    document.getElementById('btn-goto-track')?.addEventListener('click', () => {
      // Store credentials temporarily for prefill
      sessionStorage.setItem('aegis_prefill_ref', saved.referenceId);
      sessionStorage.setItem('aegis_prefill_pin', saved.verificationPin);
    });

    showToast('Incident report logged successfully!', 'success');
  });
}
