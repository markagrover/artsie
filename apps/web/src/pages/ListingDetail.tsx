import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatMoney, imageUrl, type Listing } from "../lib/api";
import { useAuth } from "../lib/auth";
import "./ListingDetail.css";

export function ListingDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getListing(id, token)
      .then((res) => {
        if (!cancelled) {
          setListing(res.listing);
          setActive(0);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  if (error) {
    return (
      <div className="container detail">
        <p className="error-banner">{error}</p>
        <Link to="/browse">Back to browse</Link>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container detail">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const images = listing.images;
  const cover = images[active];

  return (
    <article className="detail container">
      <div className="detail-grid">
        <div className="detail-gallery">
          <div className="detail-main-image">
            {cover ? (
              <img src={imageUrl(cover.url)} alt={listing.title} />
            ) : (
              <div className="detail-placeholder">No image yet</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="detail-thumbs">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  className={i === active ? "active" : ""}
                  onClick={() => setActive(i)}
                >
                  <img src={imageUrl(img.url)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="detail-copy">
          <p className="detail-seller muted">{listing.seller.displayName}</p>
          <h1>{listing.title}</h1>
          <p className="price detail-price">
            {formatMoney(listing.priceCents, listing.currency)}
          </p>
          <dl className="detail-facts">
            {listing.medium && (
              <>
                <dt>Medium</dt>
                <dd>{listing.medium}</dd>
              </>
            )}
            {listing.dimensions && (
              <>
                <dt>Dimensions</dt>
                <dd>{listing.dimensions}</dd>
              </>
            )}
            <dt>Shipping</dt>
            <dd>
              {formatMoney(listing.shippingPriceCents, listing.currency)} flat
              {listing.estimatedShipDays
                ? ` · ships in about ${listing.estimatedShipDays} days`
                : ""}
              {listing.shippingNotes ? ` — ${listing.shippingNotes}` : ""}
            </dd>
            <dt>Type</dt>
            <dd>Physical original</dd>
          </dl>
          {listing.description && (
            <p className="detail-desc">{listing.description}</p>
          )}
          <p className="detail-note muted">
            Checkout arrives in Phase 2. For now, discover and save the work you
            love.
          </p>
          <Link to="/browse" className="btn btn-ghost">
            Back to browse
          </Link>
        </div>
      </div>
    </article>
  );
}
