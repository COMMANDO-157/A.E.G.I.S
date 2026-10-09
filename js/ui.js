/**
 * A.E.G.I.S — UI Helpers & Shared Component Renderers
 * Manages accessible modals, toast notifications, badges, and clipboard helpers.
 */

import { escapeHtml } from './security.js';

/**
 * Displays a toast notification.
 * @param {string} message - Toast message text
 * @param {'info' | 'success' | 'warning' | 'error'} type - Notification type
 * @param {number} duration - Auto-dismiss timeout in ms
 */
export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');

  const textSpan = document.createElement('span');
  textSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => toast.remove();

  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, duration);
  }
}

/**
 * Renders HTML for a complaint status badge.
 * @param {string} status - 'Pending' | 'In Review' | 'Escalated' | 'Resolved'
 * @returns {string} - Badge HTML string
 */
export function renderStatusBadge(status) {
  const s = (status || 'Pending').toLowerCase();
  let badgeClass = 'badge-pending';
  let dot = '●';

  if (s.includes('review')) {
    badgeClass = 'badge-review';
  } else if (s.includes('escalat')) {
    badgeClass = 'badge-escalated';
  } else if (s.includes('resolv')) {
    badgeClass = 'badge-resolved';
  }

  return `<span class="badge ${badgeClass}">${dot} ${escapeHtml(status)}</span>`;
}

/**
 * Renders an authority badge.
 * @param {string} authority - 'HOD' | 'Dean' | 'Higher Authority'
 */
export function renderAuthorityBadge(authority) {
  let extraClass = 'badge-demo';
  if (authority === 'Dean') extraClass = 'badge-review';
  if (authority === 'Higher Authority') extraClass = 'badge-escalated';

  return `<span class="badge ${extraClass}">Tier: ${escapeHtml(authority)}</span>`;
}

/**
 * Renders an identity mode badge.
 */
export function renderIdentityBadge(mode) {
  if (mode === 'anonymous') {
    return `<span class="badge badge-anonymous">🔒 Anonymous</span>`;
  } else if (mode === 'confidential') {
    return `<span class="badge badge-confidential">🛡️ Confidential Whistleblower</span>`;
  }
  return `<span class="badge badge-demo">👤 Standard</span>`;
}

/**
 * Modal Dialog Controller
 */
export function openModal({ title, contentHtml, footerHtml = '', onClose = null }) {
  const modalBackdrop = document.getElementById('global-modal');
  if (!modalBackdrop) return;

  const titleEl = modalBackdrop.querySelector('.modal-title');
  const bodyEl = modalBackdrop.querySelector('.modal-body');
  const footerEl = modalBackdrop.querySelector('.modal-footer');

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = contentHtml;
  if (footerEl) footerEl.innerHTML = footerHtml;

  modalBackdrop.classList.remove('hidden');
  modalBackdrop.setAttribute('aria-hidden', 'false');

  // Wire close buttons
  const closeButtons = modalBackdrop.querySelectorAll('[data-close-modal]');
  closeButtons.forEach(btn => {
    btn.onclick = () => {
      closeModal();
      if (onClose) onClose();
    };
  });

  // ESC key listener
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      if (onClose) onClose();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

export function closeModal() {
  const modalBackdrop = document.getElementById('global-modal');
  if (modalBackdrop) {
    modalBackdrop.classList.add('hidden');
    modalBackdrop.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Copies text to user clipboard with toast notification.
 */
export function copyToClipboard(text, label = 'Code') {
  if (!navigator.clipboard) {
    showToast('Clipboard access unavailable in this environment', 'warning');
    return;
  }
  navigator.clipboard.writeText(text)
    .then(() => showToast(`${label} copied to clipboard!`, 'success'))
    .catch(() => showToast('Failed to copy to clipboard', 'error'));
}
