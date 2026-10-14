import { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import Brand from '../Brand';
import { ButtonLink } from '../ui/Button';
export default function Navigation() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Brand />
        <button
          className="icon-button mobile-toggle"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          aria-controls="site-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          id="site-navigation"
          className={open ? 'site-nav is-open' : 'site-nav'}
          aria-label="Main navigation"
        >
          <a href="#features" onClick={() => setOpen(false)}>
            The platform
          </a>
          <a href="#workflow" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a href="#integrity" onClick={() => setOpen(false)}>
            Built with care
          </a>
          <ButtonLink to="/login" className="small">
            Access workspace <ArrowUpRight size={16} />
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
