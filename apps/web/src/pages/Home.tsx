import { Link } from "react-router-dom";
import "./Home.css";

export function Home() {
  return (
    <div className="home">
      <section className="hero" aria-label="Artsie">
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-grain" />
          <div className="hero-wash" />
          <div className="hero-frame">
            <div className="hero-canvas" />
          </div>
        </div>
        <div className="hero-copy">
          <p className="hero-brand">Artsie</p>
          <h1>Original work, sold by the artist who made it.</h1>
          <p className="hero-lede">
            A quiet marketplace for physical originals. Artists list. Sellers
            ship. Collectors find the piece that stays.
          </p>
          <div className="hero-actions">
            <Link to="/browse" className="btn btn-accent">
              Browse originals
            </Link>
            <Link to="/register" className="btn btn-ghost">
              Start selling
            </Link>
          </div>
        </div>
      </section>

      <section className="home-section container">
        <h2>How it works</h2>
        <p className="section-lede muted">
          Phase 1 ships the foundation: accounts, uploads, and listings. Checkout
          arrives next.
        </p>
        <ol className="steps">
          <li>
            <strong>Create an account</strong>
            <span>One profile can buy and sell — flip on artist mode anytime.</span>
          </li>
          <li>
            <strong>List an original</strong>
            <span>Upload photos, set price and flat shipping, publish when ready.</span>
          </li>
          <li>
            <strong>Meet collectors</strong>
            <span>Public browse and detail pages bring eyes to your work.</span>
          </li>
        </ol>
      </section>
    </div>
  );
}
