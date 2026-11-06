import { Link } from "react-router-dom";
import { formatMoney, imageUrl, type Listing } from "../lib/api";
import "./ListingTile.css";

export function ListingTile({ listing }: { listing: Listing }) {
  const cover = listing.images[0];

  return (
    <Link to={`/listings/${listing.id}`} className="listing-tile">
      <div className="listing-tile-media">
        {cover ? (
          <img src={imageUrl(cover.url)} alt="" loading="lazy" />
        ) : (
          <div className="listing-tile-placeholder" aria-hidden>
            <span>Artsie</span>
          </div>
        )}
        {listing.status === "DRAFT" && (
          <span className="listing-tile-badge">Draft</span>
        )}
      </div>
      <div className="listing-tile-meta">
        <h3>{listing.title}</h3>
        <p className="muted">{listing.seller.displayName}</p>
        <p className="price">{formatMoney(listing.priceCents, listing.currency)}</p>
      </div>
    </Link>
  );
}
