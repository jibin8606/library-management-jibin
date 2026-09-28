import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const links =
    user.role === 'librarian'
      ? [['/admin/books', 'Catalogue'], ['/admin/loans', 'Loans'], ['/admin/reports', 'Reports']]
      : [['/books', 'Find books'], ['/my-loans', 'My loans']];
  return (
    <>
      <header className="topbar">
        <strong className="brand">📚 Library</strong>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <span className="muted">{user.name} · {user.role}</span>
        <button onClick={logout}>Log out</button>
      </header>
      <main className="container"><Outlet /></main>
    </>
  );
}
