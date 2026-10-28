import { useEffect, useState } from "react";

function parse() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { page: parts[0] || "dashboard", id: parts[1] ?? null, params: Object.fromEntries(new URLSearchParams(query)) };
}

/** Pages only the admin sees in the sidebar. */
export const ADMIN_PAGES = ["team", "timesheets", "reports", "screenshots", "archive"];

/** Tiny hash router: #/page/id?key=value */
export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(page, id = null, params = null) {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  window.location.hash = `/${page}${id ? `/${id}` : ""}${query}`;
}

export const openItem = (id) => navigate("work", id);
