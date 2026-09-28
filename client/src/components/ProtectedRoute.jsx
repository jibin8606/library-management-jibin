import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Loading } from './ui';

export const homeFor = (user) => (user.role === 'librarian' ? '/admin/books' : '/books');

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return children;
}
