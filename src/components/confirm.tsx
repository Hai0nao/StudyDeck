import { create } from "zustand";
import { Modal } from "./ui";

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirm = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

export function confirm(
  title: string,
  message: string,
  { confirmLabel = "Delete", danger = true } = {},
): Promise<boolean> {
  return new Promise((resolve) =>
    useConfirm.setState({ req: { title, message, confirmLabel, danger, resolve } }),
  );
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  if (!req) return null;
  const done = (ok: boolean) => {
    useConfirm.setState({ req: null });
    req.resolve(ok);
  };
  return (
    <Modal
      title={req.title}
      onClose={() => done(false)}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => done(false)}>
            Cancel
          </button>
          <button
            className={`btn ${req.danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => done(true)}
            autoFocus
          >
            {req.confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{req.message}</p>
    </Modal>
  );
}
