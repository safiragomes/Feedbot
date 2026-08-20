import type { Periodo } from "../lib/types";

export function Topbar({
  periodos,
  periodoId,
  onChangePeriodo,
}: {
  periodos: Periodo[];
  periodoId: string;
  onChangePeriodo: (id: string) => void;
}) {
  const atual = periodos.find((item) => item.id === periodoId);
  return (
    <div className="topbar">
      <div className="breadcrumb">
        Período <span className="sep">›</span>
        <b>{atual?.nome ?? "—"}</b>
      </div>
      <div className="topbar-right">
        <select
          className="periodo"
          value={periodoId}
          onChange={(event) => onChangePeriodo(event.target.value)}
        >
          {periodos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
