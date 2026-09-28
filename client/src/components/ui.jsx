export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const rupees = (n) => `Rs ${n}`;

export function Loading({ text = 'Loading…' }) {
  return <p className="muted" role="status">{text}</p>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <strong>{error.message}</strong>
      {Array.isArray(error.details) && (
        <ul>
          {error.details.map((d, i) => (
            <li key={i}>{d.field ? `${d.field}: ` : ''}{d.message}</li>
          ))}
        </ul>
      )}
      {onRetry && <button className="link" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`alert ${notice.type}`} role="status">
      {notice.text} {onClose && <button className="link" onClick={onClose}>dismiss</button>}
    </div>
  );
}

export function Badge({ kind, children }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  const { page, pages, total } = pagination;
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span>Page {page} of {pages} · {total} results</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

export const statusBadge = (loan) => {
  if (loan.status === 'overdue') return <Badge kind="bad">Overdue · {loan.daysLate}d</Badge>;
  if (loan.status === 'returned') return <Badge kind="muted">Returned</Badge>;
  return <Badge kind="ok">Active</Badge>;
};
