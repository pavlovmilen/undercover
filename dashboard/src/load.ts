import { useEffect, useState } from "react";

export interface Loaded<T> {
  data: T | undefined;
  error: string | undefined;
  reload: () => void;
}

/** Load data once, then again every `everyMs` milliseconds if it's set. */
export function useLoad<T>(
  load: () => Promise<T>,
  everyMs?: number,
): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    load().then(
      (value) => {
        if (!live) return;
        setData(value);
        setError(undefined);
      },
      (reason: unknown) => {
        if (live)
          setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [load, tick]);

  useEffect(() => {
    if (!everyMs) return;
    const timer = setInterval(() => {
      setTick((n) => n + 1);
    }, everyMs);
    return () => {
      clearInterval(timer);
    };
  }, [everyMs]);

  return {
    data,
    error,
    reload: () => {
      setTick((n) => n + 1);
    },
  };
}
