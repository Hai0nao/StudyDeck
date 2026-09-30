import { create } from "zustand";

interface Toast {
  id: number;
  text: string;
}

const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));
let next = 1;

export function toast(text: string) {
  const id = next++;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text }] }));
  setTimeout(
    () => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })),
    2600,
  );
}

export function Toasts() {
  const items = useToasts((s) => s.items);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
