import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/settings', label: 'Settings' },
];

export function Navbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <span className="navbar__brand">Acme</span>
      <ul className="navbar__links">
        {NAV_LINKS.map(({ to, label }) => (
          <li key={to} className={pathname === to ? 'active' : undefined}>
            <Link to={to}>{label}</Link>
          </li>
        ))}
      </ul>
      {user && (
        <button className="navbar__logout" onClick={logout}>
          Log out ({user.email})
        </button>
      )}
    </nav>
  );
}
