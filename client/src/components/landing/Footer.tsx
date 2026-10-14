import { ArrowUpRight } from 'lucide-react';
import Brand from '../Brand';
import { ButtonLink } from '../ui/Button';
export default function Footer() {
  return (
    <>
      <section className="closing-cta container">
        <div>
          <p className="eyebrow">A CLEARER WAY FORWARD</p>
          <h2>Meet your next workspace.</h2>
          <p>Explore the vision. Follow the details.</p>
        </div>
        <ButtonLink to="/preview" className="button-light">
          Open the product preview <ArrowUpRight size={18} />
        </ButtonLink>
      </section>
      <footer className="container footer">
        <div className="footer-top">
          <div>
            <Brand />
            <p>
              Banking and payroll.
              <br />
              Thoughtfully brought together.
            </p>
          </div>
          <nav aria-label="Footer navigation">
            <a href="#features">The platform</a>
            <a href="#workflow">How it works</a>
            <a href="#faq">Questions</a>
          </nav>
          <span className="footer-project">
            AN ACADEMIC DBMS PROJECT
            <br />
            <span>Designed for learning. Built in phases.</span>
          </span>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Ledgerline. Educational demonstration.</span>
          <span>No real funds. No external payments.</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </>
  );
}
