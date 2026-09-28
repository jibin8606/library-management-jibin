import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import ProtectedRoute, { homeFor } from './components/ProtectedRoute';
import { Loading } from './components/ui';
import Login from './pages/Login';
import Register from './pages/Register';
import Books from './pages/Books';
import MyLoans from './pages/MyLoans';
import ManageBooks from './pages/ManageBooks';
import AdminLoans from './pages/AdminLoans';
import Reports from './pages/Reports';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="container"><Loading /></div>;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/books" element={<ProtectedRoute role="member"><Books /></ProtectedRoute>} />
        <Route path="/my-loans" element={<ProtectedRoute role="member"><MyLoans /></ProtectedRoute>} />
        <Route path="/admin/books" element={<ProtectedRoute role="librarian"><ManageBooks /></ProtectedRoute>} />
        <Route path="/admin/loans" element={<ProtectedRoute role="librarian"><AdminLoans /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute role="librarian"><Reports /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
