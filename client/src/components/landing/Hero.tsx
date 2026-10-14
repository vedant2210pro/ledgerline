import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { ButtonLink } from '../ui/Button';
import DashboardPreview from './DashboardPreview';
export default function Hero() {
  return (
    <section className="hero container">
      <div className="hero-copy">
        <div className="overline">
          <span className="status-dot" /> CLARITY IN EVERY TRANSACTION
        </div>
        <h1>
          Banking.
          <br />
          Payroll.
          <br />
          <span>Beautifully aligned.</span>
        </h1>
        <p>
          One considered workspace for the accounts you manage and the people you pay. Bring your
          financial operations into focus.
        </p>
        <div className="hero-actions">
          <ButtonLink to="/login">
            Access workspace <ArrowUpRight size={18} />
          </ButtonLink>
          <ButtonLink to="/preview" className="button-quiet">
            Explore the preview <ArrowRight size={17} />
          </ButtonLink>
        </div>
        <div className="hero-note">
          <Check size={15} />
          <span>An academic project. A professional perspective.</span>
        </div>
      </div>
      <div className="hero-visual">
        <div className="visual-kicker">
          <span>LESS FRICTION. MORE PERSPECTIVE.</span>
          <span>01 / OVERVIEW</span>
        </div>
        <DashboardPreview />
        <div className="visual-footer">
          <span className="tiny-line" /> Every detail, part of a bigger picture.
        </div>
      </div>
    </section>
  );
}
