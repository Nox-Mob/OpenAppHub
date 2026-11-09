import { useCallback, useEffect, useState } from "react";

/** Runs an async loader on mount (and when deps change), with reload(). */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({
    loading: true,
  });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await load(), loading: false });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void run();
  }, [run]);
  return { ...state, reload: run };
}

/** Supabase calls return { data, error }; this throws the error with its message. */
export async function must<T>(
  p: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
