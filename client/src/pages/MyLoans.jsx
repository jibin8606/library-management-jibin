import { useState } from 'react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { ErrorBox, Loading, Pagination, fmtDate, rupees, statusBadge } from '../components/ui';

const TABS = ['all', 'active', 'overdue', 'returned'];

export default function MyLoans() {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(() => api.get('/loans/mine', { status, page, limit: 10 }), [status, page]);

  return (
    <>
      <h1>My loans</h1>
      {data && (
        <div className="cards">
          <div className="card"><span>On loan</span><strong>{data.summary.activeLoans} / 3</strong></div>
          <div className="card"><span>Overdue</span><strong className={data.summary.overdueLoans ? 'bad-text' : ''}>{data.summary.overdueLoans}</strong></div>
          <div className="card"><span>Fine accrued so far</span><strong className={data.summary.accruedFine ? 'bad-text' : ''}>{rupees(data.summary.accruedFine)}</strong></div>
        </div>
      )}
      {data?.summary.overdueLoans > 0 && (
        <div className="alert error">You have overdue loans, so you cannot borrow until they are returned to the librarian.</div>
      )}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === status ? 'active' : ''} onClick={() => { setStatus(t); setPage(1); }}>{t}</button>
        ))}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && (
        <div className={loading ? 'dim' : ''}>
          {data.data.length === 0 ? (
            <p className="muted">No loans here.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Book</th><th>Copy</th><th>Borrowed</th><th>Due</th><th>Returned</th><th>Status</th><th>Fine</th></tr>
              </thead>
              <tbody>
                {data.data.map((l) => (
                  <tr key={l.id} className={l.overdue ? 'row-bad' : ''}>
                    <td>{l.book.title}<div className="muted small">{l.book.author}</div></td>
                    <td className="mono">{l.copy.copyCode}</td>
                    <td>{fmtDate(l.borrowedAt)}</td>
                    <td>{fmtDate(l.dueDate)}</td>
                    <td>{fmtDate(l.returnedAt)}</td>
                    <td>{statusBadge(l)}</td>
                    <td>{l.fine > 0 ? <strong className="bad-text">{rupees(l.fine)}</strong> : rupees(0)}{l.overdue && <div className="muted small">and counting</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination pagination={data.pagination} onPage={setPage} />
        </div>
      )}
    </>
  );
}
