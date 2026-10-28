import { useEffect, useState } from "react";

// Pages live after the # (e.g. /#/showtime/<id>), so the server only ever
// serves one page and no page address can clash with an API path.
export type Page = "home" | "chat" | "showtime" | "booking" | "bookings";

export type Route = {
  page: Page;
  // The part after the page, e.g. a showtime ID
  param?: string;
  query: URLSearchParams;
};

const PAGES: Page[] = ["home", "chat", "showtime", "booking", "bookings"];

const parse = (): Route => {
  const [path, search = ""] = window.location.hash.replace(/^#\/?/, "").split("?");
  const [name, param] = path.split("/");
  const page = PAGES.includes(name as Page) ? (name as Page) : "home";
  return { page, param: param || undefined, query: new URLSearchParams(search) };
};

export const useRoute = () => {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
};

export const href = (page: Page, param?: string, query?: Record<string, string>) =>
  `#/${page}${param ? `/${encodeURIComponent(param)}` : ""}${query ? `?${new URLSearchParams(query)}` : ""}`;

export const go = (page: Page, param?: string, query?: Record<string, string>) => {
  window.location.hash = href(page, param, query).slice(1);
};
