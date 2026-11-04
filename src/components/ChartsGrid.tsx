import React, { useRef, useEffect, useState, useMemo } from 'react';
import ChartJS from 'chart.js/auto';
import { ZabbixEvent, TimelineBucket, ChartItemConfig } from '../types/zabbix';
import { SEVERITY_COLORS, SEVERITY_ORDER } from '../utils/analytics';
import { detectTimelineAnomalies } from '../utils/trends';
import { formatDuration } from '../utils/parser';
import { Download, Sliders, EyeOff, Eye, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

interface ChartsGridProps {
  events: ZabbixEvent[];
  theme: 'light' | 'dark';
  onFilterHost?: (host: string) => void;
  chartConfigs: ChartItemConfig[];
  onUpdateChartConfigs: (configs: ChartItemConfig[]) => void;
  isConfigOpen: boolean;
  onCloseConfig: () => void;
}

export const ChartsGrid: React.FC<ChartsGridProps> = ({
  events,
  theme,
  onFilterHost,
  chartConfigs,
  onUpdateChartConfigs,
  isConfigOpen,
  onCloseConfig,
}) => {
  const [timelineBucket, setTimelineBucket] = useState<TimelineBucket>('1h');

  // Referências para instâncias de gráficos para permitir exportação PNG e limpeza limpa
  const chartInstances = useRef<Record<string, ChartJS | null>>({});
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  const textColor = theme === 'dark' ? '#94a3b8' : '#64748b';
  const gridColor = theme === 'dark' ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';

  // Exportar canvas individual para PNG
  const exportChartPNG = (chartId: string, chartTitle: string) => {
    const chart = chartInstances.current[chartId];
    if (!chart) return;
    const url = chart.toBase64Image('image/png', 1);
    const link = document.createElement('a');
    link.download = `zabbix_${chartTitle.toLowerCase().replace(/\s+/g, '_')}.png`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 1. Dados: Linha do Tempo (Timeline Empilhada + Detecção de Anomalias Estatísticas > 2σ)
  const { timelineData, anomalyStats, timelineBucketTotals } = useMemo(() => {
    if (events.length === 0) {
      return {
        timelineData: { labels: [], datasets: [] },
        anomalyStats: { anomalies: [], mean: 0, stdDev: 0, thresholds: [], movingAvg: [] },
        timelineBucketTotals: [],
      };
    }

    // Ordena eventos por data de início
    const sorted = [...events]
      .filter((e) => e.dataInicio !== null)
      .sort((a, b) => a.dataInicio!.getTime() - b.dataInicio!.getTime());

    if (sorted.length === 0) {
      return {
        timelineData: { labels: [], datasets: [] },
        anomalyStats: { anomalies: [], mean: 0, stdDev: 0, thresholds: [], movingAvg: [] },
        timelineBucketTotals: [],
      };
    }

    // Define chave do bucket
    const getBucketKey = (d: Date): string => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hour = pad(d.getHours());
      const min = d.getMinutes();

      if (timelineBucket === '5m') {
        const bMin = pad(Math.floor(min / 5) * 5);
        return `${day}/${month} ${hour}:${bMin}`;
      }
      if (timelineBucket === '15m') {
        const bMin = pad(Math.floor(min / 15) * 15);
        return `${day}/${month} ${hour}:${bMin}`;
      }
      if (timelineBucket === '1h') {
        return `${day}/${month} ${hour}:00`;
      }
      return `${day}/${month}/${year}`;
    };

    const buckets = new Map<string, Record<string, number>>();
    for (const e of sorted) {
      const key = getBucketKey(e.dataInicio!);
      if (!buckets.has(key)) {
        buckets.set(key, { Desastre: 0, Alta: 0, Média: 0, Atenção: 0, Informação: 0 });
      }
      const b = buckets.get(key)!;
      b[e.severidade] = (b[e.severidade] || 0) + 1;
    }

    const labels = Array.from(buckets.keys());
    const bucketTotals = labels.map((lbl) => {
      const b = buckets.get(lbl)!;
      return SEVERITY_ORDER.reduce((acc, s) => acc + (b[s] || 0), 0);
    });

    // Detecta anomalias estatísticas onde o volume supera MA + 2σ
    const anomaliesResult = detectTimelineAnomalies(bucketTotals, labels);

    // Datasets das barras empilhadas por severidade
    const datasets: any[] = SEVERITY_ORDER.map((sev) => ({
      type: 'bar',
      label: sev,
      data: labels.map((lbl) => buckets.get(lbl)![sev] || 0),
      backgroundColor: SEVERITY_COLORS[sev],
      stack: 'stack1',
      borderRadius: 2,
    }));

    // Dataset de Média Móvel (Linha suave)
    datasets.push({
      type: 'line',
      label: 'Média Móvel (MA)',
      data: anomaliesResult.movingAvg,
      borderColor: '#8b5cf6',
      borderWidth: 1.5,
      borderDash: [3, 3],
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    });

    // Dataset do Limiar de Anomalia (+2σ) com pontos vermelhos destacados onde ocorre anomalia
    datasets.push({
      type: 'line',
      label: 'Limiar de Anomalia (+2σ)',
      data: anomaliesResult.thresholds,
      borderColor: '#ef4444',
      borderWidth: 2,
      borderDash: [5, 4],
      pointRadius: (ctx: { dataIndex: number }) => {
        const idx = ctx.dataIndex;
        const total = bucketTotals[idx] || 0;
        const th = anomaliesResult.thresholds[idx] || 0;
        return total > th && total >= 2 ? 6 : 0;
      },
      pointHoverRadius: 8,
      pointBackgroundColor: '#ef4444',
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      fill: false,
      tension: 0.2,
    });

    return {
      timelineData: { labels, datasets },
      anomalyStats: anomaliesResult,
      timelineBucketTotals: bucketTotals,
    };
  }, [events, timelineBucket]);

  // 2. Dados: Distribuição por Severidade
  const { severityDistributionData, severityCounts, severityAvgDurations } = useMemo(() => {
    const counts: Record<string, number> = {};
    const durSums: Record<string, number> = {};
    for (const sev of SEVERITY_ORDER) {
      counts[sev] = 0;
      durSums[sev] = 0;
    }
    for (const e of events) {
      counts[e.severidade] = (counts[e.severidade] || 0) + 1;
      durSums[e.severidade] = (durSums[e.severidade] || 0) + e.duracaoSegundos;
    }

    const avgDurations: Record<string, number> = {};
    for (const sev of SEVERITY_ORDER) {
      avgDurations[sev] = counts[sev] > 0 ? Math.round(durSums[sev] / counts[sev]) : 0;
    }

    return {
      severityCounts: counts,
      severityAvgDurations: avgDurations,
      severityDistributionData: {
        labels: SEVERITY_ORDER,
        datasets: [
          {
            data: SEVERITY_ORDER.map((s) => counts[s] || 0),
            backgroundColor: SEVERITY_ORDER.map((s) => SEVERITY_COLORS[s]),
            borderWidth: 2,
            borderColor: theme === 'dark' ? '#0f172a' : '#ffffff',
          },
        ],
      },
    };
  }, [events, theme]);

  // 3. Dados: Top 10 Hosts
  const topHostsData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.host, (counts.get(e.host) || 0) + 1);

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      labels: sorted.map((s) => s[0]),
      datasets: [
        {
          label: 'Eventos',
          data: sorted.map((s) => s[1]),
          backgroundColor: '#3b82f6',
          borderRadius: 4,
        },
      ],
    };
  }, [events]);

  // 4. Dados: Top 10 Triggers
  const { topTriggersData, topTriggersMeta } = useMemo(() => {
    const map = new Map<string, { count: number; totalDur: number; sev: string }>();
    for (const e of events) {
      const item = map.get(e.incidente) || { count: 0, totalDur: 0, sev: e.severidade };
      item.count++;
      item.totalDur += e.duracaoSegundos;
      map.set(e.incidente, item);
    }

    const sorted = Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    const fullNames = sorted.map((s) => s[0]);
    const counts = sorted.map((s) => s[1].count);
    const avgDurs = sorted.map((s) => Math.round(s[1].totalDur / s[1].count));
    const sevs = sorted.map((s) => s[1].sev);

    return {
      topTriggersMeta: { fullNames, counts, avgDurs, sevs },
      topTriggersData: {
        labels: fullNames,
        datasets: [
          {
            label: 'Ocorrências',
            data: counts,
            backgroundColor: '#f59e0b',
            borderRadius: 4,
          },
        ],
      },
    };
  }, [events]);

  // 5. Dados: Status dos Eventos (RESOLVIDO vs INCIDENTE)
  const statusDistributionData = useMemo(() => {
    let resolvidos = 0;
    let incidentes = 0;
    for (const e of events) {
      if (e.status === 'RESOLVIDO') resolvidos++;
      else incidentes++;
    }

    return {
      labels: ['RESOLVIDO', 'INCIDENTE'],
      datasets: [
        {
          data: [resolvidos, incidentes],
          backgroundColor: ['#16a34a', '#dc2626'],
          borderWidth: 2,
          borderColor: theme === 'dark' ? '#0f172a' : '#ffffff',
        },
      ],
    };
  }, [events, theme]);

  // 6. Dados: Duração Média por Severidade
  const { durationBySeverityData, durationMeta } = useMemo(() => {
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const s of SEVERITY_ORDER) {
      sums[s] = 0;
      counts[s] = 0;
    }
    for (const e of events) {
      sums[e.severidade] = (sums[e.severidade] || 0) + e.duracaoSegundos;
      counts[e.severidade] = (counts[e.severidade] || 0) + 1;
    }

    const avgMinutes = SEVERITY_ORDER.map((s) =>
      counts[s] > 0 ? Math.round(sums[s] / counts[s] / 60) : 0
    );
    const avgSeconds = SEVERITY_ORDER.map((s) =>
      counts[s] > 0 ? Math.round(sums[s] / counts[s]) : 0
    );

    return {
      durationMeta: { avgMinutes, avgSeconds, counts },
      durationBySeverityData: {
        labels: SEVERITY_ORDER,
        datasets: [
          {
            label: 'Minutos Médios',
            data: avgMinutes,
            backgroundColor: SEVERITY_ORDER.map((s) => SEVERITY_COLORS[s]),
            borderRadius: 4,
          },
        ],
      },
    };
  }, [events]);

  // 7. Dados: Eventos por Hora do Dia (0-23h)
  const { eventsByHourData, hourlyMax } = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const counts = new Array(24).fill(0);

    for (const e of events) {
      if (e.dataInicio) {
        const h = e.dataInicio.getHours();
        counts[h]++;
      }
    }

    const maxVal = Math.max(...counts, 0);

    return {
      hourlyMax: maxVal,
      eventsByHourData: {
        labels: hours.map((h) => `${String(h).padStart(2, '0')}h`),
        datasets: [
          {
            label: 'Eventos',
            data: counts,
            backgroundColor: '#6366f1',
            borderRadius: 3,
          },
        ],
      },
    };
  }, [events]);

  // 8. Dados: Evolução de Incidentes em Aberto
  const openIncidentsEvolutionData = useMemo(() => {
    if (events.length === 0) return { labels: [], datasets: [] };

    const sorted = [...events]
      .filter((e) => e.dataInicio !== null)
      .sort((a, b) => a.dataInicio!.getTime() - b.dataInicio!.getTime());

    let backlog = 0;
    const labels: string[] = [];
    const values: number[] = [];

    for (const e of sorted) {
      if (e.status === 'INCIDENTE') {
        backlog++;
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      const d = e.dataInicio!;
      const lbl = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      labels.push(lbl);
      values.push(backlog);
    }

    return {
      labels,
      datasets: [
        {
          label: 'Incidentes Ativos',
          data: values,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    };
  }, [events]);

  // Inicializa e atualiza os gráficos Chart.js com segurança de ciclo de vida
  useEffect(() => {
    const destroyAll = () => {
      Object.keys(chartInstances.current).forEach((key) => {
        if (chartInstances.current[key]) {
          chartInstances.current[key]!.destroy();
          chartInstances.current[key] = null;
        }
      });
    };

    destroyAll();

    // Helper options de escalas
    const commonScales = {
      x: {
        ticks: { color: textColor, font: { size: 10 } },
        grid: { color: gridColor },
      },
      y: {
        ticks: { color: textColor, font: { size: 10 } },
        grid: { color: gridColor },
      },
    };

    // Estilo translúcido elegante e unificado para os tooltips dos 8 gráficos
    const commonTooltipTheme = {
      backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(30, 41, 59, 0.95)',
      titleColor: '#ffffff',
      bodyColor: '#f1f5f9',
      footerColor: '#38bdf8',
      borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(148, 163, 184, 0.35)',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      titleFont: { size: 12, weight: 'bold' as const, family: "'Plus Jakarta Sans', sans-serif" },
      bodyFont: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
      footerFont: { size: 10, weight: 'bold' as const, family: "'JetBrains Mono', monospace" },
      boxPadding: 4,
    };

    // 1. Timeline Chart (Barras empilhadas + Linha de Média Móvel + Linha de Limiar de Anomalia)
    if (canvasRefs.current['chart-timeline'] && timelineData.labels.length > 0) {
      chartInstances.current['chart-timeline'] = new ChartJS(canvasRefs.current['chart-timeline'], {
        type: 'bar',
        data: timelineData as any,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { color: textColor, font: { size: 11 }, boxWidth: 12 },
            },
            tooltip: {
              ...commonTooltipTheme,
              callbacks: {
                title: (items) => `Intervalo: ${items[0]?.label || ''}`,
                label: (item) => {
                  if (item.datasetIndex >= 5) {
                    return `${item.dataset.label}: ${item.parsed.y} eventos`;
                  }
                  const sev = item.dataset.label || '';
                  const count = item.parsed.y || 0;
                  const idx = item.dataIndex;
                  const bTotal = timelineBucketTotals[idx] || 1;
                  const pct = Math.round((count / bTotal) * 100);
                  return `${sev}: ${count} incidentes (${pct}% do período)`;
                },
                footer: (items) => {
                  const idx = items[0]?.dataIndex;
                  if (idx === undefined) return '';

                  const total = items.reduce((acc, curr) => {
                    return curr.datasetIndex < 5 ? acc + (curr.parsed.y || 0) : acc;
                  }, 0);

                  const th = anomalyStats.thresholds[idx] || 0;
                  const ma = anomalyStats.movingAvg[idx] || 0;

                  if (total > th && total >= 2) {
                    return `Total no período: ${total} eventos\n🚨 ANOMALIA ESTATÍSTICA: Volume excede a média móvel (${ma}) por mais de 2σ (Limiar: ${th})`;
                  }
                  return `Total no período: ${total} eventos | Média Móvel: ${ma} | Limiar (+2σ): ${th}`;
                },
              },
            },
          },
          scales: commonScales,
        },
      });
    }

    // 2. Severidade Doughnut
    if (canvasRefs.current['chart-severity']) {
      chartInstances.current['chart-severity'] = new ChartJS(canvasRefs.current['chart-severity'], {
        type: 'doughnut',
        data: severityDistributionData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: textColor, font: { size: 11 }, boxWidth: 12 },
            },
            tooltip: {
              ...commonTooltipTheme,
              callbacks: {
                title: (items) => `Severidade: ${items[0]?.label || ''}`,
                label: (item) => {
                  const sev = item.label;
                  const count = item.parsed as number;
                  const total = events.length || 1;
                  const pct = ((count / total) * 100).toFixed(1);
                  return `Volume: ${count} incidentes (${pct}% do total filtrado)`;
                },
                afterLabel: (item) => {
                  const sev = item.label;
                  const avgSec = severityAvgDurations[sev] || 0;
                  return `Duração Média: ${formatDuration(avgSec)}`;
                },
                footer: (items) => {
                  const sev = items[0]?.label;
                  if (sev === 'Desastre' || sev === 'Alta') return '⚠️ Criticidade Máxima com impacto direto no SLA';
                  return 'Monitoramento operacional preventivo';
                },
              },
            },
          },
          cutout: '65%',
        },
      });
    }

    // 3. Top Hosts Horizontal Bar
    if (canvasRefs.current['chart-hosts'] && topHostsData.labels.length > 0) {
      chartInstances.current['chart-hosts'] = new ChartJS(canvasRefs.current['chart-hosts'], {
        type: 'bar',
        data: topHostsData,
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          onClick: (event, elements) => {
            if (elements.length > 0 && onFilterHost) {
              const index = elements[0].index;
              const hostName = topHostsData.labels[index];
              onFilterHost(hostName);
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltipTheme,
              callbacks: {
                title: (items) => `Servidor / Host: ${items[0]?.label || ''}`,
                label: (item) => {
                  const count = item.parsed.x as number;
                  const total = events.length || 1;
                  const pct = ((count / total) * 100).toFixed(1);
                  return `Alarmes Disparados: ${count} incidentes (${pct}% do escopo)`;
                },
                afterLabel: () => '💡 Clique na barra para filtrar incidentes deste host',
              },
            },
          },
          scales: commonScales,
        },
      });
    }

    // 4. Top Triggers Horizontal Bar
    if (canvasRefs.current['chart-triggers'] && topTriggersData.labels.length > 0) {
      chartInstances.current['chart-triggers'] = new ChartJS(canvasRefs.current['chart-triggers'], {
        type: 'bar',
        data: topTriggersData,
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltipTheme,
              callbacks: {
                title: (items) => {
                  const idx = items[0]?.dataIndex;
                  return topTriggersMeta.fullNames[idx] || items[0]?.label || '';
                },
                label: (item) => {
                  const count = item.parsed.x as number;
                  const total = events.length || 1;
                  const pct = ((count / total) * 100).toFixed(1);
                  return `Ocorrências: ${count} vezes (${pct}% de todos os alarmes)`;
                },
                afterLabel: (item) => {
                  const idx = item.dataIndex;
                  const avgSec = topTriggersMeta.avgDurs[idx] || 0;
                  const sev = topTriggersMeta.sevs[idx] || '';
                  return `Duração Média: ${formatDuration(avgSec)} | Severidade: ${sev}`;
                },
                footer: () => '💡 Trigger com alto impacto de ruído / flapping',
              },
            },
          },
          scales: {
            x: commonScales.x,
            y: {
              ticks: {
                color: textColor,
                font: { size: 10 },
                callback: function (val, idx) {
                  const fullLabel = topTriggersData.labels[idx] || '';
                  return fullLabel.length > 32 ? fullLabel.slice(0, 32) + '...' : fullLabel;
                },
              },
              grid: { color: gridColor },
            },
          },
        },
      });
    }

    // 5. Status Pie Chart
    if (canvasRefs.current['chart-status']) {
      chartInstances.current['chart-status'] = new ChartJS(canvasRefs.current['chart-status'], {
        type: 'pie',
        data: statusDistributionData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: textColor, font: { size: 11 }, boxWidth: 12 },
            },
            tooltip: {
              ...commonTooltipTheme,
              callbacks: {
                title: (items) => `Status: ${items[0]?.label || ''}`,
                label: (item) => {
                  const label = item.label;
                  const count = item.parsed as number;
                  const total = events.length || 1;
                  const pct = ((count / total) * 100).toFixed(1);
                  return `Volume: ${count} incidentes (${pct}% do total)`;
                },
                afterLabel: (item) => {
                  return item.label === 'RESOLVIDO'
                    ? '✅ Alarmes encerrados e normalizados'
                    : '🚨 Backlog de incidentes ativos aguardando solução';
                },
              },
            },
          },
        },
      });
    }

    // 6. Duração Média por Severidade
    if (canvasRefs.current['chart-duration']) {
      chartInstances.current['chart-duration'] = new ChartJS(canvasRefs.current['chart-duration'], {
        type: 'bar',
        data: durationBySeverityData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltipTheme,
              callbacks: {
                title: (items) => `Criticidade: ${items[0]?.label || ''}`,
                label: (item) => {
                  const sev = item.label;
                  const avgMin = item.parsed.y as number;
                  const avgSec = durationMeta.avgSeconds[SEVERITY_ORDER.indexOf(sev as any)] || 0;
                  return `Tempo Médio: ${formatDuration(avgSec)} (${avgMin} minutos)`;
                },
                afterLabel: (item) => {
                  const sev = item.label;
                  const count = durationMeta.counts[sev] || 0;
                  return `Amostra: ${count} incidentes nesta criticidade`;
                },
                footer: (items) => {
                  const sev = items[0]?.label;
                  if (sev === 'Desastre' || sev === 'Alta') return 'Foco prioritário para redução do MTTR';
                  return 'Tempo médio de restabelecimento do serviço';
                },
              },
            },
          },
          scales: {
            ...commonScales,
            y: {
              ...commonScales.y,
              title: { display: true, text: 'Minutos', color: textColor, font: { size: 10 } },
            },
          },
        },
      });
    }

    // 7. Eventos por Hora do Dia
    if (canvasRefs.current['chart-hours']) {
      chartInstances.current['chart-hours'] = new ChartJS(canvasRefs.current['chart-hours'], {
        type: 'bar',
        data: eventsByHourData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltipTheme,
              callbacks: {
                title: (items) => {
                  const lbl = items[0]?.label || '0h';
                  const hourNum = parseInt(lbl.replace('h', ''), 10);
                  const nextHour = (hourNum + 1) % 24;
                  return `Janela: ${lbl} às ${String(nextHour).padStart(2, '0')}:00`;
                },
                label: (item) => {
                  const count = item.parsed.y as number;
                  const total = events.length || 1;
                  const pct = ((count / total) * 100).toFixed(1);
                  return `Incidentes Registrados: ${count} (${pct}% do total)`;
                },
                afterLabel: (item) => {
                  const count = item.parsed.y as number;
                  const avg = Number((events.length / 24).toFixed(1));
                  const diff = avg > 0 ? Math.round(((count - avg) / avg) * 100) : 0;
                  const sign = diff > 0 ? '+' : '';
                  return `Média Horária: ${avg} eventos (${sign}${diff}% vs média)`;
                },
                footer: (items) => {
                  const count = items[0]?.parsed.y as number;
                  if (count === hourlyMax && count > 0) return '🔥 PICO MÁXIMO DE ALARMES DO DIA';
                  return '';
                },
              },
            },
          },
          scales: commonScales,
        },
      });
    }

    // 8. Evolução de Incidentes em Aberto
    if (canvasRefs.current['chart-evolution'] && openIncidentsEvolutionData.labels.length > 0) {
      chartInstances.current['chart-evolution'] = new ChartJS(canvasRefs.current['chart-evolution'], {
        type: 'line',
        data: openIncidentsEvolutionData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltipTheme,
              callbacks: {
                title: (items) => `Data/Hora: ${items[0]?.label || ''}`,
                label: (item) => {
                  const count = item.parsed.y as number;
                  return `Backlog Ativo: ${count} incidentes pendentes`;
                },
                afterLabel: () => 'Acompanhamento de volume de fila em tempo real',
                footer: () => 'Acúmulo de incidentes não normalizados',
              },
            },
          },
          scales: commonScales,
        },
      });
    }

    return () => {
      destroyAll();
    };
  }, [
    timelineData,
    timelineBucketTotals,
    anomalyStats,
    severityDistributionData,
    severityCounts,
    severityAvgDurations,
    topHostsData,
    topTriggersData,
    topTriggersMeta,
    statusDistributionData,
    durationBySeverityData,
    durationMeta,
    eventsByHourData,
    hourlyMax,
    openIncidentsEvolutionData,
    theme,
    events.length,
  ]);

  // Reordenar configs de gráfico
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= chartConfigs.length) return;
    const updated = [...chartConfigs];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    onUpdateChartConfigs(updated);
  };

  const handleToggleVisibility = (id: string) => {
    const updated = chartConfigs.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c));
    onUpdateChartConfigs(updated);
  };

  return (
    <div className="space-y-4">
      {/* Modal/Gaveta de Configuração de Gráficos */}
      {isConfigOpen && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-4 shadow-sm transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Personalizar Ordem e Visibilidade dos Gráficos
              </h3>
            </div>
            <button
              onClick={onCloseConfig}
              className="text-xs px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md font-medium cursor-pointer"
            >
              Concluir
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {chartConfigs.map((cfg, idx) => (
              <div
                key={cfg.id}
                className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-lg text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility(cfg.id)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer p-1"
                    title={cfg.visible ? 'Ocultar gráfico' : 'Exibir gráfico'}
                  >
                    {cfg.visible ? (
                      <Eye className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <span className={`truncate font-medium ${cfg.visible ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through'}`}>
                    {cfg.title}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, 'up')}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === chartConfigs.length - 1}
                    onClick={() => handleMove(idx, 'down')}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid Responsivo de 2 Colunas de Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {chartConfigs
          .filter((c) => c.visible)
          .map((cfg) => {
            return (
              <div
                key={cfg.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors flex flex-col justify-between"
              >
                {/* Header do Card com Título e Ações */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {cfg.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {cfg.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Seletor de bucket de tempo apenas para o gráfico de Timeline */}
                    {cfg.id === 'chart-timeline' && (
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md text-[10px]">
                        {(['5m', '15m', '1h', '1d'] as const).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setTimelineBucket(b)}
                            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                              timelineBucket === b
                                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-medium shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => exportChartPNG(cfg.id, cfg.title)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Exportar gráfico para PNG"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Banner de Anomalia Estatística específico para o gráfico de Timeline */}
                {cfg.id === 'chart-timeline' && anomalyStats.anomalies.length > 0 && (
                  <div className="mb-2.5 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="text-red-800 dark:text-red-200 text-[11px] leading-tight">
                      <span className="font-bold">Anomalia Estatística (+2σ): </span>
                      <span>
                        {anomalyStats.anomalies.length} pico(s) anômalo(s) detectado(s) acima do limiar normal:
                      </span>{' '}
                      <span className="font-mono font-semibold">
                        {anomalyStats.anomalies
                          .map((a) => `${a.bucket} (${a.count} ev, +${a.sigmaCount}σ)`)
                          .join(' · ')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Canvas Container */}
                <div className="relative h-64 w-full flex items-center justify-center">
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[cfg.id] = el;
                    }}
                  />
                  {cfg.id === 'chart-severity' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pr-28">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total</span>
                      <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">{events.length}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
