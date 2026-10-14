import { ArrowLeft } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
export default function NotFoundPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <section className="not-found">
      <p className="eyebrow">404 / PAGE NOT FOUND</p>
      <h1>A small detour.</h1>
      <p>This page is not part of the Ledgerline workspace.</p>
      <ButtonLink to={embedded ? '/app' : '/'}>
        <ArrowLeft size={17} /> {embedded ? 'Back to overview' : 'Back to website'}
      </ButtonLink>
    </section>
  );
}
