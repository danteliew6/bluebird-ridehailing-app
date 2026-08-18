import { createBrowserRouter, RouterProvider, NavLink, Outlet, Navigate } from 'react-router';
import { useState } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { Menu } from 'lucide-react';
import { OverviewPage } from './pages/overview/OverviewPage';
import { AiBiDashboardPage } from './pages/dashboard/AiBiDashboardPage';
import { AskBluebirdPage } from './pages/genie/AskBluebirdPage';
import { FleetForecastPage } from './pages/serving/FleetForecastPage';
import { DataAccessPage } from './pages/governance/DataAccessPage';
import { ArchitecturePage } from './pages/architecture/ArchitecturePage';

// Drop the official logo into client/public/ as bluebird-logo.png (or .svg) — it is
// picked up automatically. Until then, a stylized blue-bird badge is shown.
const LOGO_CANDIDATES = ['/bluebird-logo.png', '/bluebird-logo.svg'];

function BluebirdMark() {
  const [idx, setIdx] = useState(0);
  const logoOk = idx < LOGO_CANDIDATES.length;
  return (
    <div className="flex items-center gap-2.5">
      {logoOk ? (
        <img
          src={LOGO_CANDIDATES[idx]}
          alt="Bluebird"
          className="h-9 w-9 rounded-full bg-white object-contain p-0.5 shadow-sm"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
            {/* stylized flying bluebird silhouette (fallback mark, not the official trademark) */}
            <path
              d="M6 40c10 4 20 3 28-4-1 5-5 9-10 11 8 1 16-2 22-9 3-4 5-9 6-15-4 3-8 4-13 4 4-3 7-7 8-12-5 4-10 6-16 6-3 0-6-1-8-3-4-4-11-4-15 0-3 3-4 7-3 11-2 1-4 3-5 6 3-1 6-1 9 0-2 2-4 5-5 8z"
              fill="#0b3c8a"
            />
            <circle cx="44" cy="20" r="1.8" fill="#ffffff" />
          </svg>
        </div>
      )}
      <div className="leading-tight">
        <div className="text-white font-bold text-base tracking-tight">Bluebird</div>
        <div className="text-white/70 text-[11px] -mt-0.5">Ride-Hailing Intelligence</div>
      </div>
    </div>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

const LINKS = [
  { to: '/overview', label: 'Operations' },
  { to: '/dashboard', label: 'AI/BI Dashboard' },
  { to: '/ask', label: 'Ask Bluebird' },
  { to: '/fleet', label: 'Fleet & Forecast' },
  { to: '/access', label: 'Data Access' },
  { to: '/architecture', label: 'Architecture' },
];

function NavLinks({ className, linkClass, onClick }: { className?: string; linkClass: NavLinkClassFn; onClick?: () => void }) {
  return (
    <nav className={className}>
      {LINKS.map((l) => (
        <NavLink key={l.to} to={l.to} className={linkClass} onClick={onClick}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bb-header px-4 md:px-6 py-3 flex items-center gap-6 shadow-md">
        <BluebirdMark />
        <NavLinks className="hidden md:flex gap-1" linkClass={navLinkClass} />
        <div className="ml-auto hidden md:block text-white/60 text-xs">
          Powered by Databricks · Unity Catalog governed
        </div>
        <div className="ml-auto md:hidden">
          <Sheet open={isMobile && mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setMobileNavOpen(true)}>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Bluebird</SheetTitle>
              </SheetHeader>
              <NavLinks className="flex flex-col gap-1 mt-4" linkClass={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 bg-muted/30">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/overview" replace /> },
      { path: '/overview', element: <OverviewPage /> },
      { path: '/dashboard', element: <AiBiDashboardPage /> },
      { path: '/ask', element: <AskBluebirdPage /> },
      { path: '/fleet', element: <FleetForecastPage /> },
      { path: '/access', element: <DataAccessPage /> },
      { path: '/architecture', element: <ArchitecturePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
