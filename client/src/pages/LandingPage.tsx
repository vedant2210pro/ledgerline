import Navigation from '../components/landing/Navigation';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import Workflow from '../components/landing/Workflow';
import Faq from '../components/landing/Faq';
import Footer from '../components/landing/Footer';
export default function LandingPage() {
  return (
    <div id="top">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navigation />
      <main id="main">
        <Hero />
        <div className="foundation-strip">
          <div className="container">
            <span>
              FINANCIAL CLARITY,
              <br />
              <b>BY DESIGN.</b>
            </span>
            <p>Banking operations</p>
            <i />
            <p>People & payroll</p>
            <i />
            <p>Reports & insights</p>
            <span className="strip-tag">ONE CONNECTED VISION</span>
          </div>
        </div>
        <Features />
        <Workflow />
        <Faq />
        <Footer />
      </main>
    </div>
  );
}
