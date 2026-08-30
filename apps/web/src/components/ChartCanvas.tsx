import { Chart, type ChartConfiguration } from "chart.js/auto";
import { useEffect, useRef } from "react";

function readVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function chartPalette() {
  const isLight =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  return {
    isLight,
    text: readVar("--chart-text", "#A7B4D6"),
    muted: readVar("--chart-muted", "#6F88AB"),
    grid: readVar("--chart-grid", "#243753"),
    surface: readVar("--chart-surface", "#101B2D"),
    sky: readVar("--sky", "#7CB7F6"),
    sage: readVar("--sage", "#8AD0B8"),
    rose: readVar("--rose", "#F08C7F"),
    plum: readVar("--plum", "#9EAEF4"),
    gold: readVar("--gold", "#69D2C0"),
  };
}

export function chartGradient(
  ctx: CanvasRenderingContext2D,
  area: { top: number; bottom: number; left: number; right: number },
  start: string,
  end: string,
) {
  const gradient = ctx.createLinearGradient(area.left, area.top, area.right, area.bottom);
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);
  return gradient;
}

export function ChartCanvas({ config }: { config: ChartConfiguration }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const chartTypeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const palette = chartPalette();
    Chart.defaults.font.family = "Nunito";
    Chart.defaults.color = palette.text;
    Chart.defaults.borderColor = palette.grid;

    const existing = chartRef.current;
    // Só recria o gráfico quando o tipo muda (raro). Caso contrário, atualiza os
    // dados/opções da instância existente e deixa o Chart.js animar a transição,
    // em vez de destruir e recriar (que pisca o gráfico a cada troca de filtro).
    if (existing && chartTypeRef.current === config.type) {
      existing.data = config.data;
      existing.options = config.options ?? {};
      existing.update();
      return;
    }
    existing?.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    chartTypeRef.current = config.type;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config)]);

  useEffect(() => {
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} />;
}
