import { useEffect, useState } from "react";
import { api, type Listing } from "../lib/api";
import { ListingTile } from "../components/ListingTile";
import "./Browse.css";

export function Browse() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listListings(query || undefined)
      .then((res) => {
        if (!cancelled) {
          setListings(res.listings);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="browse container">
      <header className="browse-header">
        <div>
          <h1>Browse originals</h1>
          <p className="muted">Physical works from Artsie artists. Seller ships.</p>
        </div>
        <form
          className="browse-search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
        >
          <label className="sr-only" htmlFor="search">
            Search
          </label>
          <input
            id="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, medium…"
          />
          <button type="submit" className="btn">
            Search
          </button>
        </form>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {loading ? (
        <p className="muted">Loading the floor…</p>
      ) : listings.length === 0 ? (
        <p className="muted">No published listings yet.</p>
      ) : (
        <div className="browse-grid">
          {listings.map((listing, i) => (
            <div key={listing.id} style={{ animationDelay: `${i * 60}ms` }}>
              <ListingTile listing={listing} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
