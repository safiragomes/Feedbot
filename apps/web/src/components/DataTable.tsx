import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { IconChevronDown } from "./icons";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  headStyle?: CSSProperties;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  pageSize = 20,
  emptyState,
  className,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyState?: ReactNode;
  className?: string;
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

  return (
    <div className={`table-wrap${className ? ` ${className}` : ""}`}>
      <table>
        <thead>
          <tr>
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
          {pageRows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? "clickable" : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ textAlign: col.align }}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
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
