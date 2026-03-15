import { useState } from 'react';

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [stored, setStored] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initial;
    } catch {
      return initial;
    }
  });

  function setValue(value: T) {
    setStored(value);
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  return [stored, setValue];
}
