import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';

export function Login() {
  const [email, setEmail] = useState('officer@cybersentinel.gov');
  const [password, setPassword] = useState('officer123');
  const [role, setRole] = useState<Role>('LEA Officer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email, password, role);
      nav('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="login">
      <section className="login-intro">
        <div className="brand">
          <span>
            CYBER<span>SENTINEL</span>
          </span>
        </div>
        <div>
          <p className="eyebrow">SIH 2026 • PROBLEM 26184</p>
          <h1>
            Cybercrime Predictive
            <br />
            Intelligence Platform
          </h1>
          <p>
            Operational risk intelligence for law-enforcement coordination,
            prioritisation and response.
          </p>
        </div>
        <small>SECURE ANALYST ACCESS • OPERATIONAL ENVIRONMENT</small>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <p className="eyebrow">AUTHENTICATED ACCESS</p>
          <h2>Sign in to command view</h2>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="officer@cybersentinel.gov"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            Operational role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="LEA Officer">LEA Officer</option>
              <option value="Bank/FI">Bank/FI</option>
              <option value="I4C Analyst">I4C Analyst</option>
              <option value="Admin">Admin</option>
            </select>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn login-btn" disabled={loading}>
            {loading ? 'Authenticating…' : 'Access intelligence platform'}
          </button>
          <p className="help">
            Seeded accounts: <code>officer@cybersentinel.gov</code> (pw: <code>officer123</code>), <code>analyst@cybersentinel.gov</code>, <code>bank@cybersentinel.gov</code>.
          </p>
        </form>
      </section>
    </div>
  );
}
