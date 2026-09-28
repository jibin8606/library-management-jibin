import { useEffect, useState } from 'react';
import { api } from '../api';
import { useDebounced, useFetch } from '../hooks';
import { Badge, ErrorBox, Loading, Notice, Pagination, fmtDate } from '../components/ui';

export default function Books() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => setPage(1), [dq]);
  const { data, loading, error, reload } = useFetch(() => api.get('/books', { q: dq, page, limit: 10 }), [dq, page]);

  async function borrow(book) {
    setBusyId(book.id);
    setNotice(null);
    try {
      const loan = await api.post('/loans', { bookId: book.id });
      setNotice({ type: 'success', text: `Borrowed “${book.title}”. Due on ${fmtDate(loan.dueDate)}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
      reload(); // availability may have changed either way
    }
  }

  return (
    <>
      <h1>Find books</h1>
      <input
        className="search"
        type="search"
        placeholder="Search by title or author (whole words), or paste an ISBN…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && (
        <div className={loading ? 'dim' : ''}>
          {data.data.length === 0 ? (
            <p className="muted">No books found.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Title</th><th>Author</th><th>ISBN</th><th>Availability</th><th /></tr>
              </thead>
              <tbody>
                {data.data.map((b) => (
                  <tr key={b.id}>
                    <td>{b.title}</td>
                    <td>{b.author}</td>
                    <td className="mono">{b.isbn}</td>
                    <td>
                      {b.availableCopies > 0
                        ? <Badge kind="ok">{b.availableCopies} of {b.totalCopies} available</Badge>
                        : <Badge kind="bad">Not available ({b.totalCopies} copies)</Badge>}
                    </td>
                    <td>
                      <button className="primary" disabled={b.availableCopies === 0 || busyId === b.id} onClick={() => borrow(b)}>
                        {busyId === b.id ? 'Borrowing…' : 'Borrow'}
                      </button>
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
