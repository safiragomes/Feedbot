import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { IconChevronDown } from "./icons";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  headStyle?: CSSProperties;
  // Rótulo mostrado antes da célula quando a tabela vira lista de cartões em
  // mobile (ver index.css, @media max-width:720px). Só precisa ser definido
  // quando `header` não é uma string simples (ex.: cabeçalho ordenável).
  mobileLabel?: string;
  // Some da lista de cartões em mobile (ver index.css) — pra colunas
  // secundárias que deixariam cada cartão comprido demais numa tela de
  // celular. Continua na tabela normal em telas largas.
  hideOnMobile?: boolean;
  // Fixa a célula no canto direito do cartão em mobile, centralizada
  // verticalmente (ver index.css) — pra ações como excluir, que ficam junto
  // do checkbox de seleção em vez de virarem mais uma linha empilhada.
  // Atributo próprio (não reaproveita data-label="") pra não colidir com
  // colunas que só têm mobileLabel="" pra suprimir a legenda.
  mobilePin?: boolean;
  // Fica lado a lado com outras colunas `mobileInline` (mesma linha, sem
  // quebrar) em vez de virar mais uma linha empilhada no cartão em mobile.
  mobileInline?: boolean;
};

export type DataTableSelection = {
  selectedKeys: Set<string>;
  onToggleRow: (key: string) => void;
  onToggleAll: (keys: string[]) => void;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  pageSize = 20,
  emptyState,
  className,
  selection,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyState?: ReactNode;
  className?: string;
  selection?: DataTableSelection;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    // Corrige somente uma página que deixou de existir após a quantidade de linhas mudar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage((atual) => (atual * pageSize >= rows.length ? 0 : atual));
  }, [rows.length, pageSize]);

  const sortColumn = sort && columns.find((c) => c.key === sort.key);
  const sorted = useMemo(() => {
    if (!sort || !sortColumn?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const sortValue = sortColumn.sortValue;
    return [...rows].sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort?.key, sort?.dir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function toggleSort(key: string) {
    setSort((atual) => {
      if (atual?.key !== key) return { key, dir: "asc" };
      if (atual.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const todasChaves = useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const todasSelecionadas =
    selection !== undefined &&
    todasChaves.length > 0 &&
    todasChaves.every((key) => selection.selectedKeys.has(key));
  const algumasSelecionadas =
    selection !== undefined &&
    !todasSelecionadas &&
    todasChaves.some((key) => selection.selectedKeys.has(key));

  return (
    <div className={`table-wrap${className ? ` ${className}` : ""}`}>
      {selection && (
        // Substitui o checkbox "selecionar todos" do <thead> no mobile — o cabeçalho
        // inteiro some quando a tabela vira lista de cartões (ver index.css), então sem
        // isso não haveria como selecionar tudo de uma vez no celular.
        <label className="table-select-all-mobile">
          <input
            type="checkbox"
            checked={todasSelecionadas}
            ref={(el) => {
              if (el) el.indeterminate = algumasSelecionadas;
            }}
            onChange={() => selection.onToggleAll(todasSelecionadas ? [] : todasChaves)}
          />
          Selecionar todos
        </label>
      )}
      <table>
        <thead>
          <tr>
            {selection && (
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={todasSelecionadas}
                  ref={(el) => {
                    if (el) el.indeterminate = algumasSelecionadas;
                  }}
                  onChange={() => selection.onToggleAll(todasSelecionadas ? [] : todasChaves)}
                />
              </th>
            )}
            {columns.map((col) => (
              <th key={col.key} style={col.headStyle}>
                {col.sortValue ? (
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort(col.key)}
                    aria-sort={
                      sort?.key === col.key
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    {col.header}
                    <IconChevronDown
                      className={`th-sort-icon${sort?.key === col.key ? " active" : ""}${
                        sort?.key === col.key && sort.dir === "asc" ? " asc" : ""
                      }`}
                    />
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={onRowClick ? "clickable" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        // Keydown borbulha de qualquer botão/input focável dentro da linha
                        // (diferente de click, que cada ação já interrompe com
                        // stopPropagation) — sem esse filtro, apertar Enter/Espaço num botão
                        // da linha (excluir, tornar chefe, checkbox de seleção) também abriria
                        // o drawer, e o preventDefault ainda bloquearia a ação nativa do botão.
                        if (event.target !== event.currentTarget) return;
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onRowClick(row);
                      }
                    : undefined
                }
              >
                {selection && (
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Selecionar linha"
                      checked={selection.selectedKeys.has(key)}
                      onChange={() => selection.onToggleRow(key)}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ textAlign: col.align }}
                    data-label={col.mobileLabel ?? (typeof col.header === "string" ? col.header : "")}
                    data-mobile-hide={col.hideOnMobile ? "true" : undefined}
                    data-mobile-pin={col.mobilePin ? "true" : undefined}
                    data-mobile-inline={col.mobileInline ? "true" : undefined}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && emptyState}
      {rows.length > 0 && totalPages > 1 && (
        <div className="table-pagination">
          <span className="mono-cell">
            {safePage * pageSize + 1}–{Math.min(sorted.length, (safePage + 1) * pageSize)} de{" "}
            {sorted.length}
          </span>
          <div className="table-pagination-actions">
            <button
              type="button"
              className="btn sm ghost"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              Anterior
            </button>
            <span className="mono-cell">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              className="btn sm ghost"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
