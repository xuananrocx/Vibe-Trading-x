import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { echarts } from "@/lib/echarts";
import { getChartTheme } from "@/lib/chart-theme";

interface Props {
  labels: string[];
  matrix: number[][];
  height?: number;
}

export function CorrelationMatrix({ labels, matrix, height = 500 }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || labels.length === 0 || matrix.length === 0) return;

    const th = getChartTheme();
    const chart = echarts.init(ref.current);

    // Build heatmap data: [xIdx, yIdx, value]
    const data: [number, number, number][] = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < labels.length; j++) {
        const val = matrix[i]?.[j] ?? 0;
        data.push([j, i, parseFloat(val.toFixed(4))]);
      }
    }

    const minVal = -1;
    const maxVal = 1;

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        position: "top",
        backgroundColor: th.tooltipBg,
        borderColor: th.tooltipBorder,
        textStyle: { color: th.tooltipText, fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { data: [number, number, number] };
          const [x, y, v] = p.data;
          return `<b>${labels[x]}</b> ${t("charts.vs")} <b>${labels[y]}</b><br/>${t("charts.r")} = <b>${v.toFixed(4)}</b>`;
        },
      },
      grid: { left: "3%", right: "8%", top: "8%", bottom: "12%", containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          color: th.textColor,
          fontSize: 11,
          rotate: 30,
          interval: 0,
        },
        axisLine: { lineStyle: { color: th.axisColor } },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: th.textColor, fontSize: 11, interval: 0 },
        axisLine: { lineStyle: { color: th.axisColor } },
        splitArea: { show: false },
      },
      visualMap: {
        min: minVal,
        max: maxVal,
        precision: 2,
        calculable: true,
        orient: "vertical",
        right: 8,
        top: "center",
        textStyle: { color: th.textColor, fontSize: 11 },
        inRange: {
          color: ["#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b"],
        },
      },
      series: [
        {
          name: t("charts.correlation"),
          type: "heatmap",
          data,
          label: {
            show: labels.length <= 8,
            fontSize: 10,
            color: th.textColor,
            formatter: (params: unknown) => {
              const p = params as { value: [number, number, number] };
              return p.value[2].toFixed(2);
            },
          },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.5)" },
          },
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current!);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [labels, matrix, t]);

  if (labels.length === 0) {
    return <div className="text-muted-foreground text-sm p-4">{t("charts.noCorrelationData")}</div>;
  }
  return <div ref={ref} style={{ height }} />;
}