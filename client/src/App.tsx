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

function BluebirdMark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill="#ffffff" fillOpacity="0.14" />
        <path
          d="M12 30c6 1 11-2 15-8 1 3 0 6-2 8 4 0 8-3 10-8-1 8-8 14-16 14-4 0-7-2-9-5 1 0 2 0 2-1z"
          fill="var(--bb-gold)"
        />
        <circle cx="30" cy="18" r="1.6" fill="#0b3c8a" />
      </svg>
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
