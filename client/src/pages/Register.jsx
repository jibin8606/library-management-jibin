import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { homeFor } from '../components/ProtectedRoute';
import { ErrorBox } from '../components/ui';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (user) return <Navigate to={homeFor(user)} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      navigate(homeFor(await register(form.name, form.email, form.password)), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Member registration</h1>
      <ErrorBox error={error} />
      <form onSubmit={submit}>
        <label>Name<input value={form.name} onChange={set('name')} required autoFocus /></label>
        <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
        <label>Password (min 8 characters)<input type="password" value={form.password} onChange={set('password')} minLength={8} required /></label>
        <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Register'}</button>
      </form>
      <p className="muted">Already registered? <Link to="/login">Log in</Link></p>
    </div>
  );
}
