import { useEffect } from "react";
import { useAuth } from "./auth";
import { go, usePage, type Page } from "./route";
import { AuthPage } from "./pages/AuthPage";

const NAV: { page: Page; label: string }[] = [
  { page: "chat", label: "Assistant" },
  { page: "browse", label: "Browse" },
  { page: "bookings", label: "My bookings" },
];

// A page that arrives in a later step
const Placeholder = ({ title }: { title: string }) => (
  <main className="card">
    <h1>{title}</h1>
    <p className="muted">Coming soon.</p>
  </main>
);

export const App = () => {
  const { user, logout } = useAuth();
  const page = usePage();
  const publicPage = page === "login" || page === "register";

  // Every page except log in and register needs an account
  useEffect(() => {
    if (user === null && !publicPage) go("login");
    if (user && publicPage) go("chat");
  }, [user, publicPage]);

  if (user === undefined) {
    return <p className="loading">Loading…</p>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/chat">
          CineMate
        </a>
        {user && (
          <nav aria-label="Main">
            {NAV.map((item) => (
              <a key={item.page} href={`#/${item.page}`} aria-current={page === item.page ? "page" : undefined}>
                {item.label}
              </a>
            ))}
            <button type="button" className="link" onClick={() => logout()}>
              Log out
            </button>
          </nav>
        )}
      </header>

      {publicPage && <AuthPage mode={page} />}
      {user && page === "chat" && <Placeholder title="Assistant" />}
      {user && page === "browse" && <Placeholder title="Browse showtimes" />}
      {user && page === "bookings" && <Placeholder title="My bookings" />}

      <footer className="muted">Demo with fictional movies. Payments use the PayPal Sandbox: no real money.</footer>
    </div>
  );
};
