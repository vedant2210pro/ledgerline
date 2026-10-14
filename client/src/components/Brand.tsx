import { Link } from 'react-router-dom';
export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/" aria-label="Ledgerline home">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
      </span>
      {!compact && (
        <span>
          ledgerline<span className="brand-dot">.</span>
        </span>
      )}
    </Link>
  );
}
