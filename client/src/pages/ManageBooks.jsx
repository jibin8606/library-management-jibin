import { useEffect, useState } from 'react';
import { api } from '../api';
import { useDebounced, useFetch } from '../hooks';
import { Badge, ErrorBox, Loading, Notice, Pagination } from '../components/ui';

const CONDITIONS = ['good', 'damaged', 'lost'];

function BookForm({ initial, onSaved, onCancel }) {
  const editing = !!initial;
  const [form, setForm] = useState({
    isbn: initial?.isbn ?? '',
    title: initial?.title ?? '',
    author: initial?.author ?? '',
    publishedYear: initial?.publishedYear ?? '',
    description: initial?.description ?? '',
    initialCopies: 1,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      isbn: form.isbn,
      title: form.title,
      author: form.author,
      ...(form.description ? { description: form.description } : {}),
      ...(form.publishedYear !== '' ? { publishedYear: Number(form.publishedYear) } : {}),
      ...(editing ? {} : { initialCopies: Number(form.initialCopies) || 0 }),
    };
    try {
      const saved = editing ? await api.patch(`/books/${initial.id}`, body) : await api.post('/books', body);
      onSaved(saved, editing);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h3>{editing ? 'Edit book' : 'Add a book'}</h3>
      <ErrorBox error={error} />
      <div className="grid">
        <label>ISBN<input value={form.isbn} onChange={set('isbn')} required /></label>
        <label>Title<input value={form.title} onChange={set('title')} required /></label>
        <label>Author<input value={form.author} onChange={set('author')} required /></label>
        <label>Year<input type="number" value={form.publishedYear} onChange={set('publishedYear')} /></label>
        {!editing && <label>Initial copies<input type="number" min="0" max="100" value={form.initialCopies} onChange={set('initialCopies')} /></label>}
      </div>
      <label>Description<textarea rows="2" value={form.description} onChange={set('description')} /></label>
      <div className="row">
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function CopiesPanel({ book, onChanged, onClose }) {
  const { data, loading, error, reload } = useFetch(() => api.get(`/books/${book.id}/copies`), [book.id]);
  const [code, setCode] = useState('');
  const [condition, setCondition] = useState('good');
  const [notice, setNotice] = useState(null);

  const run = async (fn, okText) => {
    setNotice(null);
    try {
      await fn();
      if (okText) setNotice({ type: 'success', text: okText });
      reload();
      onChanged();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="panel">
      <div className="row between">
        <h3>Copies of “{book.title}”</h3>
        <button onClick={onClose}>Close</button>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && (
        <table>
          <thead><tr><th>Copy code</th><th>Condition</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.data.length === 0 && <tr><td colSpan="4" className="muted">No copies yet.</td></tr>}
            {data.data.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.copyCode}</td>
                <td>
                  <select value={c.condition} disabled={c.onLoan} title={c.onLoan ? 'On loan - update the condition when processing the return' : ''}
                    onChange={(e) => run(() => api.patch(`/copies/${c.id}`, { condition: e.target.value }), 'Condition updated.')}>
                    {CONDITIONS.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td>{c.onLoan ? <Badge kind="warn">On loan</Badge> : c.condition === 'good' ? <Badge kind="ok">Available</Badge> : <Badge kind="muted">Not lendable</Badge>}</td>
                <td>
                  <button className="danger" disabled={c.onLoan}
                    onClick={() => window.confirm(`Delete copy ${c.copyCode}?`) && run(() => api.del(`/copies/${c.id}`), 'Copy deleted.')}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="row" onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/books/${book.id}/copies`, { copyCode: code, condition }), 'Copy added.').then(() => setCode('')); }}>
        <input placeholder="New copy code (unique)" value={code} onChange={(e) => setCode(e.target.value)} required />
        <select value={condition} onChange={(e) => setCondition(e.target.value)}>{CONDITIONS.map((x) => <option key={x}>{x}</option>)}</select>
        <button className="primary">Add copy</button>
      </form>
    </div>
  );
}

export default function ManageBooks() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null); // null | 'new' | book
  const [copiesFor, setCopiesFor] = useState(null);
  const [notice, setNotice] = useState(null);
  useEffect(() => setPage(1), [dq]);
  const { data, loading, error, reload } = useFetch(() => api.get('/books', { q: dq, page, limit: 10 }), [dq, page]);

  async function remove(b) {
    if (!window.confirm(`Delete “${b.title}” and its copies?`)) return;
    try {
      await api.del(`/books/${b.id}`);
      setNotice({ type: 'success', text: 'Book deleted.' });
      if (copiesFor?.id === b.id) setCopiesFor(null);
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  return (
    <>
      <div className="row between"><h1>Catalogue</h1><button className="primary" onClick={() => setForm('new')}>+ Add book</button></div>
      {form && (
        <BookForm
          initial={form === 'new' ? null : form}
          onCancel={() => setForm(null)}
          onSaved={(saved, editing) => { setForm(null); setNotice({ type: 'success', text: editing ? 'Book updated.' : 'Book added.' }); reload(); }}
        />
      )}
      {copiesFor && <CopiesPanel book={copiesFor} onChanged={reload} onClose={() => setCopiesFor(null)} />}
      <input className="search" type="search" placeholder="Search by title or author (whole words), or ISBN…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && (
        <div className={loading ? 'dim' : ''}>
          {data.data.length === 0 ? <p className="muted">No books found.</p> : (
            <table>
              <thead><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Copies (available / total)</th><th /></tr></thead>
              <tbody>
                {data.data.map((b) => (
                  <tr key={b.id}>
                    <td>{b.title}</td><td>{b.author}</td><td className="mono">{b.isbn}</td>
                    <td>{b.availableCopies} / {b.totalCopies}</td>
                    <td className="actions">
                      <button onClick={() => setCopiesFor(b)}>Copies</button>
                      <button onClick={() => setForm(b)}>Edit</button>
                      <button className="danger" onClick={() => remove(b)}>Delete</button>
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
