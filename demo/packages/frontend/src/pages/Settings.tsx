import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';

export function Settings() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/users/me', { method: 'PATCH', body: new FormData(e.target as HTMLFormElement) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="page page--settings">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Profile</h2>
        <form onSubmit={handleSave}>
          <label>
            Display name
            <input name="displayName" defaultValue={user?.name} />
          </label>
          <label>
            Email
            <input name="email" type="email" defaultValue={user?.email} />
          </label>
          <Button label={saved ? 'Saved!' : 'Save changes'} />
        </form>
      </section>

      <section className="settings-section">
        <h2>Notifications</h2>
        <label><input type="checkbox" defaultChecked /> Email on new order</label>
        <label><input type="checkbox" /> Weekly digest</label>
        <label><input type="checkbox" defaultChecked /> Security alerts</label>
      </section>

      <section className="settings-section settings-section--danger">
        <h2>Danger Zone</h2>
        <Button label="Delete account" variant="danger" />
      </section>
    </main>
  );
}
