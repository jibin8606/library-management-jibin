import { useState } from 'react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { ErrorBox, Loading, Notice, Pagination, fmtDate, rupees, statusBadge } from '../components/ui';

const TABS = ['active', 'overdue', 'returned', 'all'];

export default function AdminLoans() {
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [conds, setConds] = useState({}); // loanId -> condition chosen for the return
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const { data, loading, error, reload } = useFetch(() => api.get('/loans', { status, page, limit: 15 }), [status, page]);

  async function processReturn(l) {
    setBusyId(l.id);
    setNotice(null);
    try {
      const r = await api.post(`/loans/${l.id}/return`, { condition: conds[l.id] || 'good' });
      setNotice({ type: 'success', text: `“${l.book.title}” returned by ${l.member.name}. Fine charged: ${rupees(r.fine)}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
      reload();
    }
  }

  return (
    <>
      <h1>Loans</h1>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === status ? 'active' : ''} onClick={() => { setStatus(t); setPage(1); }}>{t}</button>
        ))}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && (
        <div className={loading ? 'dim' : ''}>
          {data.data.length === 0 ? <p className="muted">No loans here.</p> : (
            <table>
              <thead><tr><th>Member</th><th>Book / copy</th><th>Borrowed</th><th>Due</th><th>Returned</th><th>Status</th><th>Fine</th><th>Return</th></tr></thead>
              <tbody>
                {data.data.map((l) => (
                  <tr key={l.id} className={l.overdue ? 'row-bad' : ''}>
                    <td>{l.member.name}<div className="muted small">{l.member.email}</div></td>
                    <td>{l.book.title}<div className="muted small mono">{l.copy.copyCode}</div></td>
                    <td>{fmtDate(l.borrowedAt)}</td>
                    <td>{fmtDate(l.dueDate)}</td>
                    <td>{fmtDate(l.returnedAt)}{l.returnCondition && l.returnCondition !== 'good' && <div className="small bad-text">{l.returnCondition}</div>}</td>
                    <td>{statusBadge(l)}</td>
                    <td>{l.fine > 0 ? <strong className="bad-text">{rupees(l.fine)}</strong> : rupees(0)}</td>
                    <td className="actions">
                      {l.status !== 'returned' && (
                        <>
                          <select value={conds[l.id] || 'good'} onChange={(e) => setConds({ ...conds, [l.id]: e.target.value })} aria-label="Condition on return">
                            <option>good</option><option>damaged</option><option>lost</option>
                          </select>
                          <button className="primary" disabled={busyId === l.id} onClick={() => processReturn(l)}>{busyId === l.id ? '…' : 'Return'}</button>
                        </>
                      )}
                    </td>
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
