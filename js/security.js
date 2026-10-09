/**
 * A.E.G.I.S — Security & Data Sanitization Utilities
 * Handles safe string escaping, role-based identity masking, and client file validation.
 */

/**
 * Escapes unsafe HTML characters to prevent XSS.
 * @param {string} str - Raw input string
 * @returns {string} - Escaped string safe for text rendering
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Masks reporter identity based on viewer role and confidentiality level.
 * 
 * Rules:
 * 1. Anonymous: No identity is recorded or displayed to ANY role (including Higher Authority).
 * 2. Confidential: Masked in HOD & Dean displays as protected whistleblower. Visible ONLY to Higher Authority.
 * 3. Standard/Open: Name and contact are visible to all authority tiers.
 * 
 * @param {Object} complaint - The complaint record
 * @param {string} viewerRole - 'HOD' | 'Dean' | 'Higher Authority' | 'Public'
 * @returns {Object} - { isMasked: boolean, displayText: string, tag: string }
 */
export function maskIdentity(complaint, viewerRole = 'Public') {
  const mode = complaint.identityMode || 'anonymous';

  if (mode === 'anonymous') {
    return {
      isMasked: true,
      displayText: 'Anonymous Whistleblower (No Identity Collected)',
      tag: 'Anonymous'
    };
  }

  if (mode === 'confidential') {
    if (viewerRole === 'Higher Authority') {
      const name = complaint.reporterName ? escapeHtml(complaint.reporterName) : 'Not Provided';
      const contact = complaint.reporterContact ? escapeHtml(complaint.reporterContact) : 'No Contact';
      const dept = complaint.reporterDepartment ? escapeHtml(complaint.reporterDepartment) : 'Unspecified';
      return {
        isMasked: false,
        displayText: `${name} (${dept}) — ${contact} [Disclosed to Tier 3 Only]`,
        tag: 'Confidential (Unmasked for Higher Authority)'
      };
    }

    // Mask for HOD, Dean, and Public
    return {
      isMasked: true,
      displayText: 'Protected Whistleblower (Identity Masked for Tier 1 & 2)',
      tag: 'Confidential'
    };
  }

  // Standard Open Reporting
  const name = complaint.reporterName ? escapeHtml(complaint.reporterName) : 'Student / Staff';
  const contact = complaint.reporterContact ? escapeHtml(complaint.reporterContact) : 'N/A';
  return {
    isMasked: false,
    displayText: `${name} — ${contact}`,
    tag: 'Standard'
  };
}

/**
 * Validates simulated client-side evidence file upload.
 * Enforces allowed types (.jpg, .jpeg, .png, .pdf) and max file size (5MB).
 * 
 * @param {File} file - Selected browser File object
 * @returns {Promise<{ valid: boolean, error?: string, fileMeta?: Object }>}
 */
export async function validateEvidenceFile(file) {
  if (!file) {
    return { valid: true, fileMeta: null };
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const maxSize = 5 * 1024 * 1024; // 5 MB

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type (${file.type || 'Unknown'}). Allowed: JPG, PNG, WEBP, PDF.`
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File exceeds maximum allowed size of 5 MB (Current: ${(file.size / (1024 * 1024)).toFixed(2)} MB).`
    };
  }

  // Safe client-side metadata capture
  return {
    valid: true,
    fileMeta: {
      name: escapeHtml(file.name),
      size: file.size,
      sizeFormatted: `${(file.size / 1024).toFixed(1)} KB`,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      isDemoSimulation: true
    }
  };
}

/**
 * Generates a unique, human-readable Complaint Reference ID.
 * Format: AEG-2026-[4 alphanumeric characters]
 */
export function generateReferenceId(existing = [], year = new Date().getFullYear(), random = Math.random) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const used = new Set(existing.map(value => String(value).toUpperCase()));
  for (let attempt = 0; attempt < 100; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += chars[Math.floor(random() * chars.length)];
    const reference = 'AEG-' + year + '-' + suffix;
    if (!used.has(reference)) return reference;
  }
  throw new Error('Unable to allocate a unique reference. Please try again.');
}

export function isValidVerificationPin(pin) {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

/**
 * Generates a separate 6-digit demo verification PIN.
 * Note: Clearly labeled for demonstration purposes only.
 */
export function generateVerificationPin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
