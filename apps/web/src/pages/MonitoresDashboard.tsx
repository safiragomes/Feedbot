import { useMemo, useState } from "react";
import type { ScriptableContext } from "chart.js";
import type { ChartConfiguration } from "chart.js/auto";
import type { Atraso, Dupla, Feedback, GrupoRevisao, Lista } from "../lib/types";
import { chartGradient, chartPalette, ChartCanvas } from "../components/ChartCanvas";
import { IconCheckCircle, IconClock, IconGrid, IconMonitor } from "../components/icons";
import { Panel, StatCard } from "../components/ui";
import { FilterSelect } from "../components/FilterSelect";
import { noPrazo } from "../lib/format";
import { classificarMonitoresComAtraso } from "../lib/monitor-risco";

export function MonitoresDashboard({
  grupos,
  duplas,
  listas,
  feedbacks,
  atrasos,
}: {
  grupos: GrupoRevisao[];
  duplas: Dupla[];
  listas: Lista[];
  feedbacks: Feedback[];
  atrasos: Atraso[];
}) {
  const [grupoId, setGrupoId] = useState("");
  const [listaId, setListaId] = useState("");
  const palette = chartPalette();

  const duplaGrupo = useMemo(() => new Map(duplas.map((d) => [d.id, d.grupoRevisaoId])), [duplas]);

  const fb = useMemo(
    () =>
      feedbacks.filter(
        (f) =>
          (!grupoId || (f.duplaId && duplaGrupo.get(f.duplaId)) === grupoId) &&
          (!listaId || f.listaId === listaId),
      ),
    [feedbacks, grupoId, listaId, duplaGrupo],
  );

  const byMonitor = new Map<
    string,
    { id: string; nome: string; total: number; comPrazo: number; noPrazo: number }
  >();
  fb.forEach((f) => {
    // Feedback de monitor já excluído não tem mais autoria — não entra no
    // desempenho por monitor, mas continua contando no histórico do aluno.
    if (!f.monitorId || !f.monitor) return;
    const atual = byMonitor.get(f.monitorId) ?? {
      id: f.monitorId,
      nome: f.monitor.nome,
      total: 0,
      comPrazo: 0,
      noPrazo: 0,
    };
    atual.total += 1;
    if (f.prazoEntregaFeedback !== null) {
      atual.comPrazo += 1;
      if (noPrazo(f.criadoEm, f.prazoEntregaFeedback)) atual.noPrazo += 1;
    }
    byMonitor.set(f.monitorId, atual);
  });
  const arr = [...byMonitor.values()];

  const totalEntregas = fb.length;
  const comPrazo = fb.filter((f) => f.prazoEntregaFeedback !== null);
  const totalPrazo = comPrazo.filter((f) => noPrazo(f.criadoEm, f.prazoEntregaFeedback)).length;
  const pctPrazo = comPrazo.length ? Math.round((totalPrazo / comPrazo.length) * 100) : 0;
  const atrasosVisiveis = atrasos.filter(
    (a) =>
      (!grupoId || duplaGrupo.get(a.duplaId) === grupoId) && (!listaId || a.listaId === listaId),
  );
  const monitoresComAtraso = new Set(atrasosVisiveis.map((a) => a.monitorId)).size;

  const gruposVisiveis = grupos.filter((g) => !grupoId || g.id === grupoId);
  const porGrupo = gruposVisiveis.map((g) => {
    const gfb = fb.filter(
      (f) => (f.duplaId && duplaGrupo.get(f.duplaId)) === g.id && f.prazoEntregaFeedback !== null,
    );
    return {
      nome: g.nome.replace("Grupo ", ""),
      prazo: gfb.filter((f) => noPrazo(f.criadoEm, f.prazoEntregaFeedback)).length,
      atraso: gfb.filter((f) => !noPrazo(f.criadoEm, f.prazoEntregaFeedback)).length,
    };
  });
  const entregasConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: porGrupo.map((g) => g.nome),
      datasets: [
        {
          label: "No prazo",
          data: porGrupo.map((g) => g.prazo),
          backgroundColor: (context: ScriptableContext<"bar">) => {
            const area = context.chart.chartArea;
            if (!area) return palette.sage;
            return chartGradient(context.chart.ctx, area, `${palette.sage}ee`, `${palette.gold}88`);
          },
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 26,
        },
        {
          label: "Entregue com atraso",
          data: porGrupo.map((g) => g.atraso),
          backgroundColor: (context: ScriptableContext<"bar">) => {
            const area = context.chart.chartArea;
            if (!area) return palette.orange;
            return chartGradient(
              context.chart.ctx,
              area,
              `${palette.orange}ee`,
              `${palette.amber}88`,
            );
          },
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: { color: palette.text, usePointStyle: true, boxWidth: 8, padding: 14 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: palette.muted, font: { weight: 700 } },
          stacked: true,
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: palette.muted },
          grid: { color: palette.grid },
          stacked: true,
        },
      },
    },
  };

  const donutConfig: ChartConfiguration<"doughnut"> = {
    type: "doughnut",
    data: {
      labels: ["No prazo", "Entregue com atraso"],
      datasets: [
        {
          data: [totalPrazo, comPrazo.length - totalPrazo],
          backgroundColor: [palette.sage, palette.orange],
          borderColor: palette.isLight ? "transparent" : palette.surface,
          borderWidth: palette.isLight ? 0 : 6,
          hoverOffset: 6,
          spacing: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: palette.text,
            font: { weight: 700, size: 11.5 },
            boxWidth: 10,
            padding: 10,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
      },
    },
  };

  const ranking = [...arr].sort((a, b) => b.total - a.total).slice(0, 8);
  const riscoPrazo = classificarMonitoresComAtraso(atrasosVisiveis, arr).slice(0, 4);
  const sinais = [
    {
      label: "SLA da operação",
      value: `${pctPrazo}%`,
      hint: `${totalPrazo} entregas no prazo entre ${comPrazo.length} com prazo definido.`,
      tone: pctPrazo >= 80 ? "ok" : pctPrazo >= 60 ? "warn" : "danger",
    },
    {
      label: "Atrasos abertos",
      value: String(atrasosVisiveis.length),
      hint: "Feedbacks não concluídos cujo prazo já venceu.",
      tone: atrasosVisiveis.length === 0 ? "ok" : atrasosVisiveis.length <= 4 ? "warn" : "danger",
    },
    {
      label: "Monitores sob atenção",
      value: String(monitoresComAtraso),
      hint: "Monitores com pelo menos um atraso aberto na seleção.",
      tone: monitoresComAtraso <= 1 ? "ok" : monitoresComAtraso <= 3 ? "warn" : "danger",
    },
  ] as const;
  const rankingConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: ranking.map((m) => m.nome.split(" ")[0]!),
      datasets: [
        {
          data: ranking.map((m) => m.total),
          backgroundColor: (context: ScriptableContext<"bar">) => {
            const area = context.chart.chartArea;
            if (!area) return palette.sky;
            return chartGradient(context.chart.ctx, area, `${palette.sky}ee`, `${palette.gold}88`);
          },
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 16,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, color: palette.muted },
          grid: { color: palette.grid },
        },
        y: { grid: { display: false }, ticks: { color: palette.muted, font: { weight: 700 } } },
      },
    },
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monitores</h1>
          <div className="subtitle">
            Entregas de feedback, prazos e volume por grupo de revisão e lista.
          </div>
        </div>
      </div>

      <div className="filterbar">
        <span className="flag">Grupo</span>
        <FilterSelect
          label="grupo"
          placeholder="todos os grupos"
          value={grupoId}
          onChange={setGrupoId}
          options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
        />
        <span className="flag">Lista</span>
        <FilterSelect
          label="lista"
          placeholder="todas as listas"
          value={listaId}
          onChange={setListaId}
          options={listas.map((l) => ({ value: l.id, label: l.nome }))}
        />
      </div>

      <div className="stats">
        <StatCard
          label="Monitores com registro"
          value={arr.length}
          icon={<IconMonitor />}
          color="sky"
          compact
        />
        <StatCard
          label="Entregas no prazo"
          value={`${pctPrazo}%`}
          sub={`${totalPrazo}/${totalEntregas} registros`}
          icon={<IconCheckCircle />}
          color="sage"
          compact
        />
        <StatCard
          label="Monitores com atraso"
          value={monitoresComAtraso}
          sub={`${atrasosVisiveis.length} atraso(s) aberto(s)`}
          icon={<IconClock />}
          color="rose"
          compact
        />
        <StatCard
          label="Grupos na visão"
          value={grupoId ? 1 : grupos.length}
          icon={<IconGrid />}
          color="gold"
          compact
        />
      </div>

      <div className="insight-grid">
        <Panel title="Saúde do ciclo" tag="resumo de prazo" className="panel-compact">
          <div className="signal-list">
            {sinais.map((sinal) => (
              <div key={sinal.label} className="signal-item">
                <div>
                  <span className={`signal-dot ${sinal.tone}`} />
                  <strong>{sinal.label}</strong>
                </div>
                <b>{sinal.value}</b>
                <p>{sinal.hint}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Monitores com maior risco" tag="atrasos abertos" className="panel-compact">
          <div className="ranking-list">
            {riscoPrazo.length ? (
              riscoPrazo.map((item, index) => (
                <div key={item.monitorId} className="ranking-item">
                  <span className="ranking-index">0{index + 1}</span>
                  <div>
                    <strong>{item.nome}</strong>
                    <p>{item.atrasosAbertos} atraso(s) aberto(s)</p>
                  </div>
                  <b>{item.taxaPrazo === null ? "sem histórico" : `${item.taxaPrazo}%`}</b>
                </div>
              ))
            ) : (
              <div className="empty-inline">Nenhum monitor com atraso aberto nesta seleção.</div>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="Entregas por grupo de revisão"
        className="panel-chart panel-chart-hero"
        legend={
          <div className="legend-row">
            <span>
              <i style={{ background: "var(--sage)" }} />
              no prazo
            </span>
            <span>
              <i style={{ background: "var(--orange)" }} />
              entregue com atraso
            </span>
          </div>
        }
      >
        <div className="chart-wrap">
          <ChartCanvas config={entregasConfig} />
        </div>
      </Panel>

      <div className="panel-grid">
        <Panel title="Ranking de volume" tag="top monitores por registros" className="panel-chart">
          <div className="chart-wrap md">
            <ChartCanvas config={rankingConfig} />
          </div>
        </Panel>
        <Panel title="Entregas no prazo — geral" className="panel-chart">
          <div className="chart-wrap md">
            <ChartCanvas config={donutConfig} />
          </div>
        </Panel>
      </div>
    </>
  );
}
