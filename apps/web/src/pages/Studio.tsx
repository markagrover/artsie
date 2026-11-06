import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, formatMoney, type Listing } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ListingTile } from "../components/ListingTile";
import "./Studio.css";

type FormState = {
  title: string;
  description: string;
  medium: string;
  dimensions: string;
  price: string;
  shippingPrice: string;
  shippingNotes: string;
  estimatedShipDays: string;
  status: "DRAFT" | "PUBLISHED";
};

const emptyForm: FormState = {
  title: "",
  description: "",
  medium: "",
  dimensions: "",
  price: "",
  shippingPrice: "0",
  shippingNotes: "",
  estimatedShipDays: "5",
  status: "DRAFT",
};

export function Studio() {
  const { user, token, loading } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!token) return;
    const res = await api.myListings(token);
    setListings(res.listings);
  }

  useEffect(() => {
    if (token && user?.isArtist) {
      void load().catch((err: Error) => setError(err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.isArtist]);

  if (loading) {
    return (
      <div className="container studio">
        <p className="muted">Loading studio…</p>
      </div>
    );
  }
  if (!user || !token) return <Navigate to="/login" replace />;
  if (!user.isArtist) {
    return (
      <div className="container studio">
        <h1>Studio</h1>
        <p className="muted">
          Enable artist mode on your{" "}
          <Link to="/account">account</Link> to list originals.
        </p>
      </div>
    );
  }

  function dollarsToCents(value: string): number {
    const n = Number(value);
    if (Number.isNaN(n) || n <= 0) throw new Error("Enter a valid price");
    return Math.round(n * 100);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        description: form.description,
        medium: form.medium || null,
        dimensions: form.dimensions || null,
        priceCents: dollarsToCents(form.price),
        shippingPriceCents: Math.round(Number(form.shippingPrice || 0) * 100),
        shippingNotes: form.shippingNotes || null,
        estimatedShipDays: (() => {
          if (!form.estimatedShipDays.trim()) return null;
          const days = Number(form.estimatedShipDays);
          if (!Number.isInteger(days) || days <= 0) {
            throw new Error("Ship days must be a whole number");
          }
          return days;
        })(),
        status: form.status,
        kind: "ORIGINAL",
      };
      let listing: Listing;
      if (editingId) {
        ({ listing } = await api.updateListing(token, editingId, body));
      } else {
        ({ listing } = await api.createListing(token, body));
        // So a retry after a failed image upload updates this listing
        // instead of creating a duplicate.
        setEditingId(listing.id);
      }
      if (files && files.length > 0) {
        try {
          ({ listing } = await api.uploadImages(token, listing.id, files));
        } catch (uploadErr) {
          setFiles(null);
          await load();
          throw new Error(
            uploadErr instanceof Error
              ? `Listing saved, but image upload failed: ${uploadErr.message}`
              : "Listing saved, but image upload failed",
          );
        }
      }
      setForm(emptyForm);
      setEditingId(null);
      setFiles(null);
      await load();
      void listing;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(listing: Listing) {
    setEditingId(listing.id);
    setForm({
      title: listing.title,
      description: listing.description,
      medium: listing.medium ?? "",
      dimensions: listing.dimensions ?? "",
      price: String(listing.priceCents / 100),
      shippingPrice: String(listing.shippingPriceCents / 100),
      shippingNotes: listing.shippingNotes ?? "",
      estimatedShipDays: listing.estimatedShipDays
        ? String(listing.estimatedShipDays)
        : "",
      status: listing.status,
    });
    setFiles(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!token) return;
    if (!confirm("Delete this listing?")) return;
    await api.deleteListing(token, id);
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm);
    }
    await load();
  }

  return (
    <div className="studio container">
      <header className="studio-header">
        <div>
          <h1>Studio</h1>
          <p className="muted">
            Draft and publish physical originals. Flat shipping is set per
            listing.
          </p>
        </div>
      </header>

      <form className="studio-form" onSubmit={onSubmit}>
        <h2>{editingId ? "Edit listing" : "New listing"}</h2>
        {error && <p className="error-banner">{error}</p>}
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="medium">Medium</label>
            <input
              id="medium"
              value={form.medium}
              onChange={(e) => setForm({ ...form, medium: e.target.value })}
              placeholder="Oil on linen"
            />
          </div>
          <div className="field">
            <label htmlFor="dimensions">Dimensions</label>
            <input
              id="dimensions"
              value={form.dimensions}
              onChange={(e) => setForm({ ...form, dimensions: e.target.value })}
              placeholder="24 × 36 in"
            />
          </div>
          <div className="field">
            <label htmlFor="price">Price (USD)</label>
            <input
              id="price"
              required
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="1200"
            />
          </div>
          <div className="field">
            <label htmlFor="ship">Flat shipping (USD)</label>
            <input
              id="ship"
              inputMode="decimal"
              value={form.shippingPrice}
              onChange={(e) =>
                setForm({ ...form, shippingPrice: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="days">Est. ship days</label>
            <input
              id="days"
              inputMode="numeric"
              value={form.estimatedShipDays}
              onChange={(e) =>
                setForm({ ...form, estimatedShipDays: e.target.value })
              }
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="notes">Shipping notes</label>
          <input
            id="notes"
            value={form.shippingNotes}
            onChange={(e) =>
              setForm({ ...form, shippingNotes: e.target.value })
            }
            placeholder="Ships in a tube with COA"
          />
        </div>
        <div className="field">
          <label htmlFor="desc">Description</label>
          <textarea
            id="desc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={form.status}
              onChange={(e) =>
                setForm({
                  ...form,
                  status: e.target.value as "DRAFT" | "PUBLISHED",
                })
              }
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="images">Artwork images (up to 4, under 800KB each)</label>
            <input
              id="images"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={(e) => setFiles(e.target.files)}
            />
          </div>
        </div>
        <div className="studio-actions">
          <button className="btn btn-accent" type="submit" disabled={busy}>
            {busy ? "Saving…" : editingId ? "Update listing" : "Create listing"}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setFiles(null);
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <section className="studio-list">
        <h2>Your listings</h2>
        {listings.length === 0 ? (
          <p className="muted">No listings yet — create your first original above.</p>
        ) : (
          <div className="studio-grid">
            {listings.map((listing) => (
              <div key={listing.id} className="studio-item">
                <ListingTile listing={listing} />
                <div className="studio-item-actions">
                  <span className="muted">
                    {listing.status.toLowerCase()} ·{" "}
                    {formatMoney(listing.priceCents)} · ship{" "}
                    {formatMoney(listing.shippingPriceCents)}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => startEdit(listing)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void remove(listing.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
