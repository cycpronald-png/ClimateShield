import { Suspense, lazy, useState } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from "./components/theme-provider"
import { AppShell } from './components/layout/AppShell'
import { Toaster } from 'sonner'
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/services/queryClient'
import { OnlineManager } from '@/components/OnlineManager'
import { OfflineBannerWrapper } from './components/OfflineBannerWrapper'

// Lazy Load Pages to isolate crashes
const ControlPlane = lazy(() => import("./pages/ControlPlane"));
const RiskIntelligence = lazy(() => import("./pages/RiskIntelligence"));
const Settings = lazy(() => import("./pages/Settings"));
const Donate = lazy(() => import("./pages/donate/Donate"));

import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
  const [, setRetryKey] = useState(0);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Toaster richColors position="bottom-right" />
        <TooltipProvider>
          <ErrorBoundary>
            <OnlineManager />
            <OfflineBannerWrapper onRetry={() => setRetryKey((k) => k + 1)} />
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
    </QueryClientProvider>
  );
}

export default App
