/**
 * A.E.G.I.S 4.0 — Frontend Entrypoint
 * WP-4.1.1
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Guardian Design System Stylesheets
import './styles/tokens.css';
import './styles/global.css';
import './styles/accessibility.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Fatal: #root container element missing from DOM.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
