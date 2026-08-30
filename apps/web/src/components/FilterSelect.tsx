import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconSearch, IconX } from "./icons";

export type FilterOption = { value: string; label: string };

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Cada abertura começa com a lista completa; o foco é sincronizado no frame seguinte.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="filter-select" ref={rootRef}>
      <div className={`filter-select-trigger${value ? " has-value" : ""}`}>
        <button
          type="button"
          className="filter-select-open"
          onClick={() => setOpen((atual) => !atual)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{selected ? selected.label : placeholder}</span>
          {!value && <IconChevronDown />}
        </button>
        {value ? (
          <button
            type="button"
            className="filter-select-clear"
            aria-label={`Limpar filtro de ${label.toLowerCase()}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <IconX />
          </button>
        ) : null}
      </div>
      {open && (
        <div className="filter-select-panel" role="listbox">
          <div className="filter-select-search">
            <IconSearch />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}…`}
            />
          </div>
          <div className="filter-select-options">
            <button
              type="button"
              className={`filter-select-option${!value ? " active" : ""}`}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {placeholder}
            </button>
            {filtered.map((option) => (
              <button
                type="button"
                key={option.value}
                className={`filter-select-option${option.value === value ? " active" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
            {!filtered.length && <div className="filter-select-empty">Nada encontrado</div>}
          </div>
        </div>
      )}
    </div>
  );
}
