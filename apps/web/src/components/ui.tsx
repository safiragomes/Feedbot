import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { avatarColor, initials } from "../lib/format";
import { IconX } from "./icons";
import type { ConfirmRequest } from "../lib/types";

export type { ConfirmRequest } from "../lib/types";

export function Avatar({ nome, size = 30 }: { nome: string; size?: number }) {
  const [fg, bg] = avatarColor(nome);
  return (
    <div className="avatar" style={{ width: size, height: size, color: fg, background: bg }}>
      {initials(nome)}
    </div>
  );
}

export function Chip({
  tone = "off",
  children,
}: {
  tone?: "ok" | "warn" | "danger" | "info" | "off";
  children: ReactNode;
}) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  compact = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  color: "sky" | "plum" | "rose" | "gold" | "sage";
  compact?: boolean;
}) {
  return (
    <div className={`stat${compact ? " stat-compact" : ""}`}>
      <div className="stat-top">
        <span className="label">{label}</span>
        <div className="icon-wrap" style={{ background: `var(--${color}-dim)` }}>
          <span style={{ color: `var(--${color})`, display: "flex" }}>{icon}</span>
        </div>
      </div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Panel({
  title,
  tag,
  legend,
  fit,
  className,
  children,
}: {
  title?: string;
  tag?: string;
  legend?: ReactNode;
  fit?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`panel${fit ? " panel-fit" : ""}${className ? ` ${className}` : ""}`}>
      {(title || tag || legend) && (
        <div className="panel-head">
          {title && <h3>{title}</h3>}
          {tag && <span className="tag">{tag}</span>}
          {legend}
        </div>
      )}
      {children}
    </div>
  );
}

export function Modal({
  onClose,
  children,
  wide = false,
}: {
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return createPortal(
    <div
      className="overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal${wide ? " modal-wide" : ""}`}>{children}</div>
    </div>,
    document.body,
  );
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">{children}</div>
    </>
  );
}

export function DrawerCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="drawer-close" onClick={onClose}>
      <IconX />
    </button>
  );
}

export function MiniRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mini-row">
      <span className="l">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {hint}
    </div>
  );
}

export function ConfirmModal({
  request,
  onClose,
}: {
  request: ConfirmRequest;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <h4>{request.title}</h4>
      <p>{request.message}</p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn danger-solid"
          onClick={async () => {
            await request.onConfirm();
            onClose();
          }}
        >
          {request.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
