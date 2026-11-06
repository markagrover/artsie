const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type User = {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  isArtist: boolean;
  createdAt: string;
};

export type ListingImage = {
  id: string;
  url: string;
  sortOrder: number;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  medium: string | null;
  dimensions: string | null;
  kind: "ORIGINAL" | "PRINT" | "DOWNLOAD";
  status: "DRAFT" | "PUBLISHED";
  priceCents: number;
  currency: string;
  quantity: number;
  shippingPriceCents: number;
  shippingNotes: string | null;
  estimatedShipDays: number | null;
  createdAt: string;
  updatedAt: string;
  images: ListingImage[];
  seller: {
    id: string;
    displayName: string;
    bio: string | null;
  };
};

function authHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  const auth = authHeaders(token);
  Object.entries(auth).forEach(([k, v]) => headers.set(k, v));
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const timeoutMs = path.includes("/images") ? 45_000 : 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        path.includes("/images")
          ? "Image upload timed out — try a smaller JPEG/PNG (under 800KB)"
          : "Request timed out — try again",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // HTTP/2 often has an empty statusText — never rely on it alone.
    let message = "";
    try {
      const data = (await res.json()) as {
        error?: string | { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      };
      if (typeof data.error === "string") {
        message = data.error;
      } else if (data.error && typeof data.error === "object") {
        const fields = data.error.fieldErrors
          ? Object.entries(data.error.fieldErrors)
              .flatMap(([k, v]) => (v ?? []).map((msg) => `${k}: ${msg}`))
              .join("; ")
          : "";
        const form = (data.error.formErrors ?? []).join("; ");
        message = [form, fields].filter(Boolean).join("; ") || "Invalid request";
      } else {
        message = `Request failed (${res.status})`;
      }
    } catch {
      message = `Request failed (${res.status})`;
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function imageUrl(url: string): string {
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export const api = {
  register: (body: {
    email: string;
    password: string;
    displayName: string;
    isArtist?: boolean;
  }) =>
    request<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: (token: string) =>
    request<{ user: User }>("/api/auth/me", {}, token),

  updateMe: (
    token: string,
    body: Partial<{ displayName: string; bio: string | null; isArtist: boolean }>,
  ) =>
    request<{ user: User }>(
      "/api/auth/me",
      { method: "PATCH", body: JSON.stringify(body) },
      token,
    ),

  listListings: (q?: string) =>
    request<{ listings: Listing[] }>(
      `/api/listings${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),

  myListings: (token: string) =>
    request<{ listings: Listing[] }>("/api/listings/mine", {}, token),

  getListing: (id: string, token?: string | null) =>
    request<{ listing: Listing }>(`/api/listings/${id}`, {}, token),

  createListing: (
    token: string,
    body: Record<string, unknown>,
  ) =>
    request<{ listing: Listing }>(
      "/api/listings",
      { method: "POST", body: JSON.stringify(body) },
      token,
    ),

  updateListing: (
    token: string,
    id: string,
    body: Record<string, unknown>,
  ) =>
    request<{ listing: Listing }>(
      `/api/listings/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
      token,
    ),

  deleteListing: (token: string, id: string) =>
    request<void>(`/api/listings/${id}`, { method: "DELETE" }, token),

  uploadImages: (token: string, id: string, files: FileList | File[]) => {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("images", f));
    return request<{ listing: Listing }>(
      `/api/listings/${id}/images`,
      { method: "POST", body: form },
      token,
    );
  },
};
