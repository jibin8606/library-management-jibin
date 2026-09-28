import { api } from '../api';
import { useFetch } from '../hooks';
import { ErrorBox, Loading, rupees } from '../components/ui';

export default function Reports() {
  const top = useFetch(() => api.get('/reports/most-borrowed'), []);
  const overdue = useFetch(() => api.get('/reports/overdue-members'), []);
  return (
    <>
      <h1>Reports</h1>
      <h2>Q1 · Most borrowed books (last 30 days)</h2>
      <ErrorBox error={top.error} onRetry={top.reload} />
      {top.loading && <Loading />}
      {top.data && (top.data.data.length === 0 ? <p className="muted">No loans in the last 30 days.</p> : (
        <table>
          <thead><tr><th>#</th><th>Title</th><th>Author</th><th>ISBN</th><th>Times borrowed</th></tr></thead>
          <tbody>{top.data.data.map((r, i) => (
            <tr key={r.bookId}><td>{i + 1}</td><td>{r.title}</td><td>{r.author}</td><td className="mono">{r.isbn}</td><td>{r.borrowCount}</td></tr>
          ))}</tbody>
        </table>
      ))}
      <h2>Q2 · Members with overdue loans</h2>
      <ErrorBox error={overdue.error} onRetry={overdue.reload} />
      {overdue.loading && <Loading />}
      {overdue.data && (overdue.data.data.length === 0 ? <p className="muted">Nobody has overdue loans.</p> : (
        <table>
          <thead><tr><th>Member</th><th>Email</th><th>Overdue loans</th><th>Longest overdue</th><th>Fine if returned today</th></tr></thead>
          <tbody>{overdue.data.data.map((r) => (
            <tr key={r.memberId}><td>{r.name}</td><td>{r.email}</td><td>{r.overdueLoans}</td><td>{r.maxDaysLate} days</td><td><strong className="bad-text">{rupees(r.totalFine)}</strong></td></tr>
          ))}</tbody>
        </table>
      ))}
    </>
  );
}
