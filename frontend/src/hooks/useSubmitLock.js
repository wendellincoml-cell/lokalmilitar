import { useCallback, useRef, useState } from "react";

export default function useSubmitLock() {
  const pendingRef = useRef(new Set());
  const [pendingActions, setPendingActions] = useState(new Set());

  const run = useCallback(async (key, action) => {
    if (pendingRef.current.has(key)) return;

    pendingRef.current.add(key);
    setPendingActions(new Set(pendingRef.current));
    try {
      return await action();
    } finally {
      pendingRef.current.delete(key);
      setPendingActions(new Set(pendingRef.current));
    }
  }, []);

  const isPending = useCallback((key) => pendingActions.has(key), [pendingActions]);
  return { run, isPending };
}
