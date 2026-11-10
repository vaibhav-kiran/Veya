import { useEffect, useState } from "react";

/** Becomes true once `ms` have passed since mount — used to stop waiting silently. */
export function useTimedOut(ms: number): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return timedOut;
}
