import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Nav } from "./components/Nav";
import { AuthProvider } from "./lib/auth";
import { Home } from "./pages/Home";
import { Browse } from "./pages/Browse";
import { ListingDetail } from "./pages/ListingDetail";
import { Login, Register } from "./pages/Auth";
import { Account } from "./pages/Account";
import { Studio } from "./pages/Studio";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="site-shell">
          <Nav />
          <main className="site-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/listings/:id" element={<ListingDetail />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/account" element={<Account />} />
              <Route path="/studio" element={<Studio />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
