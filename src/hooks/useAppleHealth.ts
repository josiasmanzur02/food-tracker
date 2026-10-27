import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppleHealthData } from '../types';
import { createAppleHealthData, readAppleHealth, requestAppleHealthAccess, supportsAppleHealth } from '../services/appleHealth';

export function useAppleHealth(data: AppleHealthData, onChange: (next: AppleHealthData) => void) {
  const latest = useRef({ data, onChange });
  latest.current = { data, onChange };
  const pending = useRef(false);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = supportsAppleHealth();

  const sync = useCallback(async (authorize = false) => {
    if (pending.current || !supportsAppleHealth()) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const request = ++generation.current;
    try {
      if (authorize) {
        await requestAppleHealthAccess();
        if (generation.current !== request) return;
        latest.current.onChange({ ...latest.current.data, syncEnabled: true });
      }
      const snapshot = await readAppleHealth();
      if (generation.current !== request) return;
      latest.current.onChange({ syncEnabled: true, snapshot });
    } catch (cause) {
      if (generation.current === request) {
        setError(cause instanceof Error ? cause.message : 'Apple Health could not refresh. Please try again.');
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    generation.current += 1;
    setError('');
    latest.current.onChange(createAppleHealthData());
  }, []);

  useEffect(() => {
    if (!data.syncEnabled || !available) {
      generation.current += 1;
      return;
    }
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void sync();
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('apple-health-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('apple-health-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [data.syncEnabled, available, sync]);

  return { available, busy, error, connect: () => sync(true), refresh: () => sync(), disconnect };
}

export type AppleHealthController = ReturnType<typeof useAppleHealth>;
