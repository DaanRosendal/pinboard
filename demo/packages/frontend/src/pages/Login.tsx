import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';

export function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    if (!res.ok) {
      setError('Invalid credentials');
      return;
    }
    navigate('/dashboard');
  }

  return (
    <main className="page page--login">
      <div className="login-card">
        <h1>Acme Platform</h1>
        <form onSubmit={handleSubmit}>
          <label>Email <input name="email" type="email" required /></label>
          <label>Password <input name="password" type="password" required /></label>
          {error && <p className="error">{error}</p>}
          <Button label="Log in" />
        </form>
      </div>
    </main>
  );
}
