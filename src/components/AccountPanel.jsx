import { useState } from 'react';

export default function AccountPanel({ auth, onClose }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (auth.user) {
    return (
      <div className="account-panel">
        <p className="account-panel-email">Signed in as {auth.user.email}</p>
        <button type="button" className="account-panel-submit" onClick={() => auth.signOut()}>
          Sign out
        </button>
      </div>
    );
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
    <form className="account-panel" onSubmit={handleSubmit}>
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
