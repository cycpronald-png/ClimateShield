import { Suspense, lazy, useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from "./components/theme-provider"
import { AppShell } from './components/layout/AppShell'
import { Toaster } from 'sonner'
import { TooltipProvider } from "@/components/ui/tooltip"
import { RetryProvider, useRetry } from "./context/RetryContext"
import { OfflineBanner } from './components/OfflineBanner'

// Lazy Load Pages to isolate crashes
const ControlPlane = lazy(() => import("./pages/ControlPlane"));
const RiskIntelligence = lazy(() => import("./pages/RiskIntelligence"));
const Settings = lazy(() => import("./pages/Settings"));
const Donate = lazy(() => import("./pages/donate/Donate"));

import { ErrorBoundary } from './components/ErrorBoundary'

function OfflineBannerWrapper() {
  const { triggerRetry } = useRetry();
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (!offline) return null;
  return <OfflineBanner lastSuccessfulFetch={null} onRetry={triggerRetry} />;
}

function App() {
  return (
    <RetryProvider>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Toaster richColors position="bottom-right" />
        <TooltipProvider>
          <ErrorBoundary>
            <OfflineBannerWrapper />
            <Router>
              <Suspense fallback={<div className="p-8 text-foreground/50">Loading Module...</div>}>
                <Routes>
                  <Route path="/" element={<AppShell />}>
                    <Route index element={<RiskIntelligence />} />
                    <Route path="control-plane" element={<ControlPlane />} />
                    <Route path="donate" element={<Donate />} />
                    <Route path="risk-intelligence" element={<RiskIntelligence />} />
                    <Route path="settings" element={<Settings />} />
                  </Route>
                </Routes>
              </Suspense>
            </Router>
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </RetryProvider>
  )
}

export default App