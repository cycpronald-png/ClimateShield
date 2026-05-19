import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface RetryContextValue {
  retryKey: number;
  triggerRetry: () => void;
}

const RetryContext = createContext<RetryContextValue | undefined>(undefined);

export function RetryProvider({ children }: { children: ReactNode }) {
  const [retryKey, setRetryKey] = useState(0);
  const triggerRetry = useCallback(() => setRetryKey(k => k + 1), []);
  return (
    <RetryContext.Provider value={{ retryKey, triggerRetry }}>
      {children}
    </RetryContext.Provider>
  );
}

export function useRetry() {
  const ctx = useContext(RetryContext);
  if (!ctx) throw new Error("useRetry must be used within RetryProvider");
  return ctx;
}
