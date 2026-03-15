import { useEffect, useState } from 'react';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useData<T>(url: string): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(r => r.json())
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(err => { if (!cancelled) setState({ data: null, loading: false, error: String(err) }); });
    return () => { cancelled = true; };
  }, [url]);

  return state;
}
