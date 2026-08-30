import type { Atraso } from "./types";

export type DesempenhoMonitor = {
  id: string;
  nome: string;
  comPrazo: number;
  noPrazo: number;
};

export function classificarMonitoresComAtraso(atrasos: Atraso[], desempenhos: DesempenhoMonitor[]) {
  const desempenhoPorId = new Map(desempenhos.map((item) => [item.id, item]));
  const porMonitor = new Map<string, { monitorId: string; nome: string; atrasosAbertos: number }>();

  for (const atraso of atrasos) {
    const atual = porMonitor.get(atraso.monitorId) ?? {
      monitorId: atraso.monitorId,
      nome: atraso.monitorNome,
      atrasosAbertos: 0,
    };
    atual.atrasosAbertos += 1;
    porMonitor.set(atraso.monitorId, atual);
  }

  return [...porMonitor.values()]
    .map((item) => {
      const desempenho = desempenhoPorId.get(item.monitorId);
      const taxaPrazo =
        desempenho?.comPrazo && desempenho.comPrazo > 0
          ? Math.round((desempenho.noPrazo / desempenho.comPrazo) * 100)
          : null;
      return { ...item, taxaPrazo };
    })
    .sort(
      (a, b) =>
        b.atrasosAbertos - a.atrasosAbertos ||
        (a.taxaPrazo ?? 101) - (b.taxaPrazo ?? 101) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
}
