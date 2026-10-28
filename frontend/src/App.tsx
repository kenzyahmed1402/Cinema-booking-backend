import { useEffect, useRef, type MouseEvent } from "react";
import { useAuth } from "./auth";
import { go, href, useRoute, type Page } from "./route";
import { Home } from "./pages/Home";
import { ThemeToggle } from "./components/ThemeToggle";

const NAV: { page: Page; label: string }[] = [
  { page: "home", label: "What's on" },
  { page: "chat", label: "Assistant" },
  { page: "bookings", label: "My bookings" },
];

// A page that arrives in a later step
const Placeholder = ({ title, text }: { title: string; text: string }) => (
  <section className="placeholder card">
    <h1>{title}</h1>
    <p className="muted">{text}</p>
    <a className="button secondary" href={href("home")}>
      Back to what's on
    </a>
  </section>
);

export const App = () => {
  const { user, logout, requireUser } = useAuth();
  const route = useRoute();
  const main = useRef<HTMLElement>(null);

  // My bookings needs an account: ask for one, or go back home
  useEffect(() => {
    if (route.page === "bookings" && user === null) {
      requireUser("Log in to see your bookings").then((next) => {
        if (!next) go("home");
      });
    }
  }, [route.page, user, requireUser]);

  // Page addresses use the #, so the skip link moves focus itself
  const skip = (event: MouseEvent) => {
    event.preventDefault();
    main.current?.focus();
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={skip}>
        Skip to content
      </a>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a className="brand" href={href("home")}>
            <span className="logo-mark" aria-hidden="true" />
            CineMate
          </a>
          <nav aria-label="Main">
            {NAV.map((item) => (
              <a key={item.page} href={href(item.page)} aria-current={route.page === item.page ? "page" : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="account">
            <ThemeToggle />
            {user === undefined ? null : user ? (
              <>
                <span className="user-name">
                  {user.isGuest ? "Guest" : user.name}
                  {user.isGuest && <span className="badge">temporary</span>}
                </span>
                <button type="button" className="button ghost small" onClick={() => logout()}>
                  Log out
                </button>
              </>
            ) : (
              <button type="button" className="button ghost small" onClick={() => requireUser("Welcome to CineMate")}>
                Log in
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="wrap" ref={main} tabIndex={-1}>
        {route.page === "home" && <Home />}
        {route.page === "chat" && (
          <Placeholder title="Assistant" text="The chat with booking cards arrives in the next step." />
        )}
        {route.page === "showtime" && (
          <Placeholder title="Choose your seats" text="The seat picker arrives in a later step." />
        )}
        {route.page === "bookings" && user && (
          <Placeholder title="My bookings" text="Your bookings, payments and cancellations arrive in a later step." />
        )}
      </main>

      <footer className="footer">
        <p className="wrap muted">Fictional movies and cinemas. Payments use the PayPal Sandbox: no real money is charged.</p>
      </footer>
    </div>
  );
};
