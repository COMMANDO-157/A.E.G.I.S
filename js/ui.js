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
 * Renders a severity badge.
 * @param {string} severity - 'Low' | 'Moderate' | 'Critical'
 */
export function renderSeverityBadge(severity) {
  const s = (severity || 'Low').toLowerCase();
  if (s.includes('crit')) {
    return `<span class="badge badge-escalated" style="box-shadow: 0 0 10px rgba(244,63,94,0.35);">⚡ Critical</span>`;
  } else if (s.includes('mod')) {
    return `<span class="badge badge-pending">⚠️ Moderate</span>`;
  }
  return `<span class="badge badge-demo">🔹 Low Risk</span>`;
}

/**
 * Renders an urgency badge.
 * @param {string} urgency - 'Routine' | 'Urgent' | 'Immediate Danger'
 */
export function renderUrgencyBadge(urgency) {
  const u = (urgency || 'Routine').toLowerCase();
  if (u.includes('immediate') || u.includes('danger')) {
    return `<span class="badge badge-escalated">🆘 Immediate Danger</span>`;
  } else if (u.includes('urgent')) {
    return `<span class="badge badge-pending">⏱️ Urgent</span>`;
  }
  return `<span class="badge badge-demo">Routine</span>`;
}

/**
 * Renders a routing origin badge.
 */
export function renderRoutingOriginBadge(origin) {
  const orig = origin || 'Initial Triage';
  let badgeClass = 'badge-demo';
  if (orig.includes('Bypass')) badgeClass = 'badge-escalated';
  else if (orig.includes('Linked')) badgeClass = 'badge-review';
  else if (orig.includes('Override')) badgeClass = 'badge-confidential';

  return `<span class="badge ${badgeClass}" style="font-size: 0.68rem;">${escapeHtml(orig)}</span>`;
}

/**
 * Modal Dialog Controller
 */
let activeModal = null;
export function openModal({ title, contentHtml, footerHtml = '', onClose = null }) {
  closeModal();
  const backdrop = document.getElementById('global-modal');
  if (!backdrop) return;
  const dialog = backdrop.querySelector('.modal-dialog');
  const previousFocus = document.activeElement;
  backdrop.querySelector('.modal-title').textContent = title;
  backdrop.querySelector('.modal-body').innerHTML = contentHtml;
  backdrop.querySelector('.modal-footer').innerHTML = footerHtml;
  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  dialog.setAttribute('tabindex', '-1');
  const background = [...document.body.children].filter(el => el !== backdrop &&
    ['HEADER', 'MAIN', 'FOOTER', 'ASIDE', 'A'].includes(el.tagName));
  const priorInert = background.map(el => el.inert);
  background.forEach(el => { el.inert = true; });
  const focusable = () => [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
  const keyHandler = event => {
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') {
      const items = focusable();
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  };
  const clickHandler = event => {
    if (event.target === backdrop || event.target.closest('[data-close-modal]')) closeModal();
  };
  activeModal = { backdrop, previousFocus, background, priorInert, keyHandler, clickHandler, onClose };
  document.addEventListener('keydown', keyHandler);
  backdrop.addEventListener('click', clickHandler);
  (focusable()[0] || dialog).focus();
}

export function closeModal() {
  if (!activeModal) return;
  const state = activeModal;
  activeModal = null;
  document.removeEventListener('keydown', state.keyHandler);
  state.backdrop.removeEventListener('click', state.clickHandler);
  state.backdrop.classList.add('hidden');
  state.backdrop.setAttribute('aria-hidden', 'true');
  state.background.forEach((el, i) => { el.inert = state.priorInert[i]; });
  if (state.previousFocus?.isConnected) state.previousFocus.focus();
  if (state.onClose) state.onClose();
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
