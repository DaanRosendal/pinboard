import React from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarItem {
  to: string;
  icon: string;
  label: string;
}

const ITEMS: SidebarItem[] = [
  { to: '/dashboard', icon: '⊞', label: 'Dashboard' },
  { to: '/products', icon: '◫', label: 'Products' },
  { to: '/orders', icon: '◳', label: 'Orders' },
  { to: '/customers', icon: '◷', label: 'Customers' },
  { to: '/analytics', icon: '▦', label: 'Analytics' },
  { to: '/settings', icon: '⚙', label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      {ITEMS.map(({ to, icon, label }) => (
        <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'sidebar__item active' : 'sidebar__item'}>
          <span className="sidebar__icon">{icon}</span>
          <span className="sidebar__label">{label}</span>
        </NavLink>
      ))}
    </aside>
  );
}
