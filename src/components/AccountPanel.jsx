import { useEffect, useState } from 'react';
import { fetchMySubmissions } from '../data/submissions';
import { upsertProfile } from '../data/profiles';
import SettingsPanel from './SettingsPanel';
import DeveloperPanel from './DeveloperPanel';
import AdminPanel from './AdminPanel';

function PageHeader({ title, onSettings, onClose }) {
  return (
    <div className="account-page-header">
      <h2 className="account-page-title">{title}</h2>
      <div className="account-page-header-actions">
        {onSettings && (
          <button type="button" className="account-page-icon-button" aria-label="Settings" onClick={onSettings}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        <button type="button" className="account-page-icon-button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function AccountPanel({ auth, profile, onProfileChange, onStartAddPlace, settings, onUpdateSettings, places, onClose }) {
  const [showSettings, setShowSettings] = useState(false);
  const [showDeveloper, setShowDeveloper] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mySubmissions, setMySubmissions] = useState([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!auth.user) return;
    fetchMySubmissions(auth.user.id)
      .then(setMySubmissions)
      .catch(() => {});
  }, [auth.user]);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setAvatarUrl(profile?.avatar_url ?? '');
  }, [profile]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const next = await upsertProfile({ userId: auth.user.id, displayName: displayName.trim(), avatarUrl: avatarUrl.trim() });
      onProfileChange?.(next);
      setEditingProfile(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  if (showAdmin) {
    return (
      <div className="account-page">
        <PageHeader title="Admin" onClose={onClose} />
        <button type="button" className="settings-back" aria-label="Back to profile" onClick={() => setShowAdmin(false)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <AdminPanel places={places} />
      </div>
    );
  }

  if (showDeveloper) {
    return (
      <div className="account-page">
        <PageHeader title="Developer / API" onClose={onClose} />
        <button type="button" className="settings-back" aria-label="Back to settings" onClick={() => setShowDeveloper(false)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <DeveloperPanel />
      </div>
    );
  }

  if (showSettings) {
    return (
      <div className="account-page">
        <PageHeader title="Settings" onClose={() => setShowSettings(false)} />
        <SettingsPanel settings={settings} onUpdateSettings={onUpdateSettings} onOpenDeveloper={() => setShowDeveloper(true)} />
      </div>
    );
  }

  if (auth.user) {
    return (
      <div className="account-page">
        <PageHeader title="Profile" onSettings={() => setShowSettings(true)} onClose={onClose} />
        <div className="account-profile">
          {profile?.avatar_url ? (
            <img className="account-avatar" src={profile.avatar_url} alt="" />
          ) : (
            <div className="account-avatar account-avatar-placeholder">
              {(profile?.display_name || auth.user.email || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="account-profile-text">
            <p className="account-profile-name">{profile?.display_name || 'Add a name'}</p>
            <p className="account-panel-email">{auth.user.email}</p>
          </div>
        </div>

        {editingProfile ? (
          <form className="account-profile-edit" onSubmit={handleSaveProfile}>
            <input
              className="directions-input"
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <input
              className="directions-input"
              type="url"
              placeholder="Photo URL (optional)"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
            {error && <p className="account-panel-error">{error}</p>}
            <div className="account-profile-edit-actions">
              <button type="button" onClick={() => setEditingProfile(false)}>
                Cancel
              </button>
              <button type="submit" className="account-panel-submit" disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="account-profile-edit-toggle" onClick={() => setEditingProfile(true)}>
            Edit profile
          </button>
        )}

        <button
          type="button"
          className="account-add-business"
          onClick={() => {
            onClose?.();
            onStartAddPlace?.();
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add a place
        </button>

        {profile?.is_admin && (
          <button type="button" className="account-add-business" onClick={() => setShowAdmin(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
            </svg>
            Admin: review submissions
          </button>
        )}

        {mySubmissions.length > 0 && (
          <div className="account-submissions">
            <span className="directions-label">Your submitted places</span>
            <ul>
              {mySubmissions.map((s) => (
                <li key={s.id}>
                  <span>{s.name}</span>
                  <span className={`submission-status submission-status-${s.status}`}>{s.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="account-panel-submit" onClick={() => auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  async function handleGoogleSignIn() {
    setError(null);
    const { error: authError } = await auth.signInWithGoogle();
    // On success this redirects the whole page to Google -- there's no
    // further local state to set. An error here means it never got that
    // far (e.g. the Google provider isn't configured in Supabase yet).
    if (authError) setError(authError.message);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { error: authError } = mode === 'signup' ? await auth.signUp(email, password) : await auth.signIn(email, password);
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    if (mode === 'signup') {
      setInfo('Check your email to confirm your account.');
    } else {
      onClose?.();
    }
  }

  return (
    <form className="account-page" onSubmit={handleSubmit}>
      <PageHeader title="Sign in" onSettings={() => setShowSettings(true)} onClose={onClose} />
      <img className="account-page-logo" src="/logo.png" alt="Federal University Lokoja" />
      <button type="button" className="account-google-button" onClick={handleGoogleSignIn}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24z"
          />
          <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11z" />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75z"
          />
        </svg>
        Continue with Google
      </button>
      <div className="account-divider">
        <span>or</span>
      </div>
      <div className="account-panel-tabs">
        <button type="button" data-active={mode === 'signin'} onClick={() => setMode('signin')}>
          Sign in
        </button>
        <button type="button" data-active={mode === 'signup'} onClick={() => setMode('signup')}>
          Sign up
        </button>
      </div>
      <input
        className="directions-input"
        type="email"
        placeholder="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="directions-input"
        type="password"
        placeholder="Password"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="account-panel-error">{error}</p>}
      {info && <p className="account-panel-info">{info}</p>}
      <button type="submit" className="account-panel-submit" disabled={submitting}>
        {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}
