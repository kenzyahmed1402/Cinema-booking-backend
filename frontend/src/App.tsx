import { useEffect, useRef, type MouseEvent } from "react";
import { ArrowLeft, Film, LogIn, LogOut, Sparkles, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { useAuth } from "./auth";
import { go, href, useRoute, type Page } from "./route";
import { Home } from "./pages/Home";
import { Chat } from "./pages/Chat";
import { ShowtimePage } from "./pages/Showtime";

const NAV: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: "home", label: "What's on", icon: Film },
  { page: "chat", label: "Assistant", icon: Sparkles },
  { page: "bookings", label: "My bookings", icon: Ticket },
];

// A page that arrives in a later step
const Placeholder = ({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) => (
  <section className="placeholder card">
    <span className="step-icon" aria-hidden="true">
      <Icon size={22} />
    </span>
    <h1>{title}</h1>
    <p className="muted">{text}</p>
    <a className="button secondary" href={href("home")}>
      <ArrowLeft size={16} aria-hidden="true" /> What's on
    </a>
  </section>
);

export const App = () => {
  const { user, logout, requireUser } = useAuth();
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);

  // The header's real height (it wraps on phones), so full-height pages
  // like the assistant fit the screen below it
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () =>
      document.documentElement.style.setProperty("--header-h", `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
      <header className="topbar" ref={header}>
        <div className="wrap topbar-inner">
          <a className="brand" href={href("home")}>
            <span className="logo-mark" aria-hidden="true" />
            CineMate
          </a>
          <nav aria-label="Main">
            {NAV.map(({ page, label, icon: Icon }) => (
              <a key={page} href={href(page)} aria-current={route.page === page ? "page" : undefined}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </a>
            ))}
          </nav>
          <div className="account">
            {user === undefined ? null : user ? (
              <>
                <span className="user-name">
                  <UserRound size={16} aria-hidden="true" />
                  {user.isGuest ? "Guest" : user.name}
                  {user.isGuest && <span className="badge">temporary</span>}
                </span>
                <button type="button" className="button ghost small" onClick={() => logout()}>
                  <LogOut size={15} aria-hidden="true" /> Log out
                </button>
              </>
            ) : (
              <button type="button" className="button ghost small" onClick={() => requireUser("Welcome to CineMate")}>
                <LogIn size={15} aria-hidden="true" /> Log in
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="wrap" ref={main} tabIndex={-1}>
        {route.page === "home" && <Home />}
        {route.page === "chat" && <Chat initial={route.query.get("q") ?? undefined} />}
        {route.page === "showtime" && <ShowtimePage key={route.param} id={route.param} />}
        {route.page === "bookings" && user && (
          <Placeholder icon={Ticket} title="My bookings" text="Bookings, payments and refunds arrive in a later step." />
        )}
      </main>

      <footer className="footer">
        <p className="wrap muted">Fictional movies and cinemas · PayPal Sandbox, no real money is charged</p>
      </footer>
    </div>
  );
};
