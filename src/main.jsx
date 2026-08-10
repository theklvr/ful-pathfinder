import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SharePage from './components/SharePage.jsx'

// No router library for one extra "page" -- a shared-location link is the
// only URL besides "/" this app has, so a plain pathname check is enough.
const shareMatch = window.location.pathname.match(/^\/share\/([\w-]+)$/);

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error rendering the app:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <pre style={{ whiteSpace: 'pre-wrap', color: 'red', padding: 16, fontSize: 12 }}>
          {String(this.state.error?.stack || this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>{shareMatch ? <SharePage shareId={shareMatch[1]} /> : <App />}</ErrorBoundary>
  </StrictMode>,
)

// Only in production builds — a service worker caching the dev server's
// ever-changing module URLs would make local development confusing.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker registration failed:', err));
  });
}
