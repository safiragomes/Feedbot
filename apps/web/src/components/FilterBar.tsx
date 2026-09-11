import { type ReactNode } from "react";
import { IconFilter, IconX } from "./icons";
import { Modal } from "./ui";

/**
 * Botão que abre os filtros no mobile. Fica ao lado de "Limpar filtros" no
 * `.head-actions` de cada página (por isso é um componente separado do
 * `FilterBar`, controlado de fora) — em telas largas some via CSS, a barra
 * de filtros de sempre (`.filterbar`) continua visível.
 */
export function FilterBarToggle({
  filtrosAtivos,
  onClick,
}: {
  filtrosAtivos?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="filterbar-mobile-toggle" onClick={onClick}>
      <IconFilter aria-hidden="true" />
      Filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ""}
    </button>
  );
}

/**
 * Envolve os filtros de uma página. Em telas largas é a mesma barra horizontal
 * de sempre (`.filterbar`, escondida em mobile via CSS); `open` (controlado
 * pela página, via `FilterBarToggle` em `.head-actions`) mostra os mesmos
 * controles dentro de um Modal — mesmo padrão de popup já usado no resto do
 * app (Novo grupo, Editar lista etc.), mais rápido de abrir/fechar que um
 * painel lateral.
 */
export function FilterBar({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="filterbar">{children}</div>
      {open && (
        <Modal onClose={onClose}>
          <div className="filterbar-modal-head">
            <h4>Filtros</h4>
            <button
              type="button"
              className="x-btn"
              aria-label="Fechar filtros"
              onClick={onClose}
            >
              <IconX aria-hidden="true" />
            </button>
          </div>
          <div className="filterbar-modal-fields">{children}</div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={onClose}
            >
              Aplicar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
