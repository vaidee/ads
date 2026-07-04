import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login, completeNewPassword } from '../auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challenge, setChallenge] = useState(null); // { session, username }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || '/';

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(username, password);
      if (result.done) {
        navigate(redirectTo, { replace: true });
      } else {
        setChallenge({ session: result.session, username: result.username });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleNewPassword(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await completeNewPassword(challenge.username, newPassword, challenge.session);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <div className="login-shell">
        <form className="panel login-card" onSubmit={handleNewPassword}>
          <h2>Set a new password</h2>
          {error && <div className="error-banner">{error}</div>}
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Set password and continue'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <form className="panel login-card" onSubmit={handleSubmit}>
        <h2>Sign in</h2>
        {error && <div className="error-banner">{error}</div>}
        <label htmlFor="username">Email</label>
        <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
