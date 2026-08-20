import { Chart, type ChartConfiguration } from "chart.js/auto";
import { useEffect, useRef } from "react";

Chart.defaults.font.family = "Nunito";
Chart.defaults.color = "#A7B4D6";

export const CHART_TEXT = "#A7B4D6";
export const CHART_GRID = "#1F2C48";

export function ChartCanvas({ config }: { config: ChartConfiguration }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config)]);

  return <canvas ref={canvasRef} />;
}
