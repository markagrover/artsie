import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import "./Nav.css";

export function Nav() {
  const { user, logout } = useAuth();

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link to="/" className="nav-brand" aria-label="Artsie home">
          Artsie
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/browse">Browse</NavLink>
          {user?.isArtist && <NavLink to="/studio">Studio</NavLink>}
          {user ? (
            <>
              <NavLink to="/account">{user.displayName}</NavLink>
              <button type="button" className="nav-text-btn" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <Link to="/register" className="btn btn-accent nav-cta">
                Join
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
