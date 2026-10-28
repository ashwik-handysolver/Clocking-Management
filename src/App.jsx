import { useEffect, useState } from "react";
import ArchivePage from "./components/admin/ArchivePage";
import ScreenshotsPage from "./components/admin/ScreenshotsPage";
import TeamPage from "./components/admin/TeamPage";
import Reports from "./components/admin/Reports";
import Timesheets from "./components/admin/Timesheets";
import { ClockProvider } from "./components/clock";
import { DialogsProvider } from "./components/dialogs";
import Notifications from "./components/Notifications";
import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";
import { cx } from "./components/ui";
import ItemDetail from "./components/work/ItemDetail";
import Dashboard from "./components/work/Dashboard";
import WorkOverview from "./components/work/WorkOverview";
import WorkTree, { WorkTreeRail } from "./components/work/WorkTree";
import MyWork from "./components/work/MyWork";
import { ADMIN_PAGES, navigate, useRoute } from "./lib/router";
import { CHILD_TYPE } from "./store/model";
import { StoreProvider, useStore } from "./store/store";

const COLLAPSE_KEY = "handysolver-sidebar-collapsed";

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      // Collapsed (opens on hover) unless the user chose to keep it open.
      return localStorage.getItem(COLLAPSE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* not critical */
    }
  }, [collapsed]);
  return [collapsed, setCollapsed];
}

const TREE_KEY = "handysolver-tree-hidden";

/** A true/false preference remembered in this browser. */
function useStoredFlag(key) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, on ? "1" : "0");
    } catch {
      /* not critical */
    }
  }, [key, on]);
  return [on, setOn];
}

const PAGES = ["my", "dashboard", "work", ...ADMIN_PAGES];
const PAGE_TITLE = {
  my: "My work", dashboard: "Dashboard", work: "Clients & Projects", team: "Team", timesheets: "Timesheets", reports: "Reports", screenshots: "Screenshots", archive: "Archive",
};

function Shell() {
  const route = useRoute();
  const { index } = useStore();
  // Dashboard is home; anything unknown lands there.
  const page = PAGES.includes(route.page) ? route.page : "dashboard";
  const routeItem = page === "work" && route.id ? index.get(route.id) : null;
  // Projects aren't a page of their own: they open as a tab on their client's page.
  const projectId = routeItem?.type === "project" ? routeItem.id : null;
  const selected = projectId ? index.get(routeItem.parentId) : routeItem;
  // A project's tasks show one billing category at a time, picked by ?billing= (default billable).
  const billing = route.params.billing === "non-billable" ? "non-billable" : "billable";
  // The tree shows clients and tasks only, so a subtask highlights its task.
  const treeSelectedId = routeItem?.type === "subtask" ? routeItem.parentId : routeItem?.id ?? null;
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [treeHidden, setTreeHidden] = useStoredFlag(TREE_KEY);
  const [menuOpen, setMenuOpen] = useState(false);

  // Unknown pages or deleted items fall back to a list.
  useEffect(() => {
    // Skip if a navigation is already pending (e.g. delete → open parent).
    const stillHere = window.location.hash.includes(route.id ?? route.page);
    if (!stillHere) return;
    if (route.page !== page) navigate(page);
    else if (route.id && !routeItem) navigate(page);
  }, [route.page, route.id, routeItem, page]);

  useEffect(() => {
    document.title = `${routeItem ? routeItem.name : PAGE_TITLE[page]} · HandySolver`;
    setMenuOpen(false);
  }, [routeItem, page]);

  const newType = routeItem ? CHILD_TYPE[routeItem.type] ?? "subtask" : "client";

  return (
    <div className="min-h-screen">
      {/* Decorative background on its own fixed layer (cheaper than background-attachment: fixed). */}
      <div aria-hidden="true" className="page-glow pointer-events-none fixed inset-0 -z-10" />

      <Sidebar
        pinnedOpen={!collapsed}
        onTogglePinned={() => setCollapsed((c) => !c)}
        mobileOpen={menuOpen}
        onCloseMobile={() => setMenuOpen(false)}
      />

      {/* Left padding follows the sidebar via CSS (see .app-content), so hovering never re-renders the page. */}
      <div className="app-content pt-3 pr-3 pb-6 lg:pr-4">
        <Topbar newType={newType} selectedId={routeItem?.id} page={page} onOpenMenu={() => setMenuOpen(true)} />

        {ADMIN_PAGES.includes(page) ? (
          <main className="mt-5">
            {page === "team" ? <TeamPage /> : page === "timesheets" ? <Timesheets /> : page === "reports" ? <Reports /> : page === "screenshots" ? <ScreenshotsPage /> : <ArchivePage />}
          </main>
        ) : page === "my" ? (
          <main className="mt-5">
            <MyWork />
          </main>
        ) : page === "dashboard" ? (
          <main className="mt-5">
            <Dashboard />
          </main>
        ) : (
          <main className="mt-5 space-y-5">
            <div
              className={cx(
                "grid gap-5 lg:items-start",
                treeHidden ? "lg:grid-cols-[64px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]",
              )}
            >
              {treeHidden && (
                <div className="hidden lg:sticky lg:top-[100px] lg:block">
                  <WorkTreeRail onShow={() => setTreeHidden(false)} />
                </div>
              )}
              {/* On phones the tree is never hidden: it's the way to navigate. */}
              <div className={cx("lg:sticky lg:top-[100px] lg:flex lg:h-[calc(100vh-116px)] lg:flex-col", selected && "hidden", treeHidden ? "lg:!hidden" : "lg:flex")}>
                <WorkTree selectedId={treeSelectedId} onHide={() => setTreeHidden(true)} />
              </div>
              <div className={cx("min-w-0", !selected && "hidden lg:block")}>
                {selected ? <ItemDetail key={selected.id} item={selected} projectId={projectId} billing={billing} /> : <WorkOverview />}
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <DialogsProvider>
        <ClockProvider>
          <Notifications />
          <Shell />
        </ClockProvider>
      </DialogsProvider>
    </StoreProvider>
  );
}
