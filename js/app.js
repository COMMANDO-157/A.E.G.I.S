import { renderPortalView, initPortalView } from './views/portal.js';
/**
 * A.E.G.I.S — Application Router & Bootstrap Controller
 * Manages client-side hash routing (#home, #report, #track, #dashboard),
 * mobile navigation toggle, and view lifecycle initialization.
 */

import { initIntro } from './intro.js';
import { closeModal, showToast } from './ui.js';
import { store } from './store.js';
import { renderHomeView } from './views/home.js';
import { renderReportView, initReportView } from './views/report.js';
import { renderTrackView, initTrackView } from './views/track.js';
import { renderDashboardView, initDashboardView } from './views/dashboard.js';

const routes = {
  '#student': { title: 'Student Portal — A.E.G.I.S', render: renderPortalView, init: initPortalView },
  '#authority': { title: 'Authority Portal — A.E.G.I.S', render: renderPortalView, init: initPortalView },
  '#admin': { title: 'Administrator Portal — A.E.G.I.S', render: renderPortalView, init: initPortalView },
  '#home': {
    title: 'A.E.G.I.S — Campus Safety & Grievance Shield',
    render: renderHomeView,
    init: null
  },
  '#report': {
    title: 'Report Incident — A.E.G.I.S',
    render: renderReportView,
    init: initReportView
  },
  '#track': {
    title: 'Track Complaint Status — A.E.G.I.S',
    render: renderTrackView,
    init: initTrackView
  },
  '#dashboard': {
    title: 'Authority Triage Dashboard — A.E.G.I.S',
    render: renderDashboardView,
    init: initDashboardView
  }
};

function navigate() {
  let hash = window.location.hash.toLowerCase() || '#home';
  if (!routes[hash]) {
    hash = '#home';
  }

  const route = routes[hash];
  const container = document.getElementById('app-view-container');
  if (!container) return;

  // Update Page Title
  document.title = route.title;

  // Render View
  closeModal();
  container.innerHTML = route.render();

  // Run View Initializer
  if (typeof route.init === 'function') {
    route.init();
  }

  // Update Navigation Active State
  document.querySelectorAll('.nav-link').forEach(link => {
    const linkHash = link.getAttribute('href')?.toLowerCase();
    if (linkHash === hash) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });

  // Close mobile navigation drawer if open
  const navLinks = document.getElementById('nav-links-menu');
  if (navLinks && navLinks.classList.contains('open')) {
    navLinks.classList.remove('open');
  }

  document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
  const heading = container.querySelector('h1');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function initApp() {
  // Hashchange listener
  window.addEventListener('hashchange', navigate);

  // Mobile menu toggle
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const navLinks = document.getElementById('nav-links-menu');
  if (mobileBtn && navLinks) {
    mobileBtn.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      mobileBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  // Initial routing
  navigate();
  initIntro();
  if (store.lastError) showToast(store.lastError, 'error', 0);
}

// Bootstrap on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
