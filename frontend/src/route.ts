import { useEffect, useState } from "react";

// Pages live after the # (e.g. /#/bookings), so the server only ever serves
// one page and no page address can clash with an API path like /bookings.
export type Page = "chat" | "browse" | "bookings" | "login" | "register";

const PAGES: Page[] = ["chat", "browse", "bookings", "login", "register"];

const current = (): Page => {
  const name = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return PAGES.includes(name as Page) ? (name as Page) : "chat";
};

export const usePage = () => {
  const [page, setPage] = useState<Page>(current);
  useEffect(() => {
    const onChange = () => setPage(current());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return page;
};

export const go = (page: Page) => {
  window.location.hash = `/${page}`;
};
