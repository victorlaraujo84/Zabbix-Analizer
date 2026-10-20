import {
  ZabbixEvent,
  ZabbixFilters,
  TrendsComparison,
  HostDelta,
  TriggerDelta,
  TimelineAnomaly,
} from '../types/zabbix';
import { computeKPIs } from './analytics';
import { formatDateTimeBR } from './parser';

/**
 * Calcula a comparação de tendências entre o período filtrado atual
 * e um período anterior de duração equivalente.
 */
export function calculateTrendsComparison(
  rawEvents: ZabbixEvent[],
  currentFilteredEvents: ZabbixEvent[],
  filters: ZabbixFilters
): TrendsComparison {
  // 1. Determina as datas de início e fim do período atual
  let currentFrom: Date | null = null;
  let currentTo: Date | null = null;

  if (filters.dateFrom && filters.dateTo) {
    currentFrom = new Date(filters.dateFrom);
    currentTo = new Date(filters.dateTo);
  } else {
    // Se não há filtro estrito de período, usa o span dos eventos filtrados
    for (const e of currentFilteredEvents) {
      if (e.dataInicio) {
        if (!currentFrom || e.dataInicio < currentFrom) currentFrom = e.dataInicio;
        if (!currentTo || e.dataInicio > currentTo) currentTo = e.dataInicio;
      }
    }
  }

  // Fallback se não há datas válidas
  if (!currentFrom || !currentTo) {
    const now = new Date();
    currentFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    currentTo = now;
  }

  // Duração em milissegundos
  let durationMs = currentTo.getTime() - currentFrom.getTime();
  if (durationMs <= 0) {
    durationMs = 24 * 60 * 60 * 1000; // Mínimo de 24h
  }

  // 2. Determina o período anterior equivalente
  const previousTo = new Date(currentFrom.getTime());
  const previousFrom = new Date(previousTo.getTime() - durationMs);

  // 3. Filtra eventos do período anterior a partir do dataset raw (mantendo os mesmos filtros de host/severidade/tags se houver)
  const previousEvents = rawEvents.filter((e) => {
    if (!e.dataInicio) return false;
    const time = e.dataInicio.getTime();
    if (time < previousFrom.getTime() || time > previousTo.getTime()) {
      return false;
    }

    // Aplica os mesmos filtros dimensionais ativos no período atual
    if (filters.severidades.length > 0 && !filters.severidades.includes(e.severidade)) return false;
    if (filters.hosts.length > 0 && !filters.hosts.includes(e.host)) return false;
    if (filters.triggers.length > 0 && !filters.triggers.includes(e.incidente)) return false;
    if (filters.status !== 'Todos' && e.status !== filters.status) return false;
    if (filters.reconhecido !== 'Todos' && e.reconhecido !== filters.reconhecido) return false;
    if (filters.tagKey && (!e.etiquetas[filters.tagKey] || (filters.tagValues.length > 0 && !filters.tagValues.includes(e.etiquetas[filters.tagKey])))) {
      return false;
    }

    return true;
  });

  // 4. Calcula KPIs dos dois períodos
  const currentKpis = computeKPIs(currentFilteredEvents);
  const previousKpis = computeKPIs(previousEvents);

  // 5. Calcula variações relativas (%)
  const calcPctChange = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const volumeDeltaCount = currentKpis.totalEventos - previousKpis.totalEventos;
  const volumeDeltaPct = calcPctChange(currentKpis.totalEventos, previousKpis.totalEventos);

  const mttrDeltaSeconds = currentKpis.mttrSegundos - previousKpis.mttrSegundos;
  const mttrDeltaPct = calcPctChange(currentKpis.mttrSegundos, previousKpis.mttrSegundos);

  const mtbfDeltaSeconds = currentKpis.mtbfSegundosGlobal - previousKpis.mtbfSegundosGlobal;
  const mtbfDeltaPct = calcPctChange(currentKpis.mtbfSegundosGlobal, previousKpis.mtbfSegundosGlobal);

  const ackDeltaPct = currentKpis.taxaAtuacaoPercentual - previousKpis.taxaAtuacaoPercentual;
  const openDeltaCount = currentKpis.totalAbertos - previousKpis.totalAbertos;

  // 6. Análise de degradação / melhoria por Host
  const currentHostCounts = new Map<string, number>();
  for (const e of currentFilteredEvents) {
    currentHostCounts.set(e.host, (currentHostCounts.get(e.host) || 0) + 1);
  }

  const previousHostCounts = new Map<string, number>();
  for (const e of previousEvents) {
    previousHostCounts.set(e.host, (previousHostCounts.get(e.host) || 0) + 1);
  }

  const allHosts = new Set([...currentHostCounts.keys(), ...previousHostCounts.keys()]);
  const hostDeltas: HostDelta[] = [];

  for (const host of allHosts) {
    const cCount = currentHostCounts.get(host) || 0;
    const pCount = previousHostCounts.get(host) || 0;
    const delta = cCount - pCount;
    const deltaPct = calcPctChange(cCount, pCount);
    hostDeltas.push({
      host,
      currentCount: cCount,
      previousCount: pCount,
      delta,
      deltaPct,
    });
  }

  // Hosts degradados: aumento de falhas (delta > 0)
  const degradedHosts = hostDeltas
    .filter((h) => h.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  // Hosts melhorados: redução de falhas (delta < 0)
  const improvedHosts = hostDeltas
    .filter((h) => h.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 5);

  // 7. Análise de degradação por Trigger
  const currentTriggerCounts = new Map<string, number>();
  for (const e of currentFilteredEvents) {
    currentTriggerCounts.set(e.incidente, (currentTriggerCounts.get(e.incidente) || 0) + 1);
  }

  const previousTriggerCounts = new Map<string, number>();
  for (const e of previousEvents) {
    previousTriggerCounts.set(e.incidente, (previousTriggerCounts.get(e.incidente) || 0) + 1);
  }

  const allTriggers = new Set([...currentTriggerCounts.keys(), ...previousTriggerCounts.keys()]);
  const triggerDeltas: TriggerDelta[] = [];

  for (const trigger of allTriggers) {
    const cCount = currentTriggerCounts.get(trigger) || 0;
    const pCount = previousTriggerCounts.get(trigger) || 0;
    const delta = cCount - pCount;
    const deltaPct = calcPctChange(cCount, pCount);
    triggerDeltas.push({
      trigger,
      currentCount: cCount,
      previousCount: pCount,
      delta,
      deltaPct,
    });
  }

  const degradedTriggers = triggerDeltas
    .filter((t) => t.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  return {
    hasSufficientData: previousEvents.length > 0 || currentFilteredEvents.length > 0,
    currentPeriod: {
      from: currentFrom,
      to: currentTo,
      label: `${formatDateTimeBR(currentFrom)} até ${formatDateTimeBR(currentTo)}`,
    },
    previousPeriod: {
      from: previousFrom,
      to: previousTo,
      label: `${formatDateTimeBR(previousFrom)} até ${formatDateTimeBR(previousTo)}`,
    },
    currentKpis,
    previousKpis,
    volumeDeltaPct,
    volumeDeltaCount,
    mttrDeltaPct,
    mttrDeltaSeconds,
    mtbfDeltaPct,
    mtbfDeltaSeconds,
    ackDeltaPct,
    openDeltaCount,
    degradedHosts,
    improvedHosts,
    degradedTriggers,
  };
}

/**
 * Detecta anomalias estatísticas na Linha do Tempo
 * (identifica buckets onde o volume de incidentes supera a média móvel por mais de 2 desvios padrão: C_i > MA_i + 2σ)
 */
export function detectTimelineAnomalies(
  bucketCounts: number[],
  labels: string[]
): {
  anomalies: TimelineAnomaly[];
  mean: number;
  stdDev: number;
  thresholds: number[];
  movingAvg: number[];
} {
  const n = bucketCounts.length;
  if (n === 0) {
    return { anomalies: [], mean: 0, stdDev: 0, thresholds: [], movingAvg: [] };
  }

  // 1. Calcula a média global dos buckets
  const sum = bucketCounts.reduce((acc, c) => acc + c, 0);
  const mean = sum / n;

  // 2. Calcula o desvio padrão global dos buckets
  const variance = bucketCounts.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // 3. Calcula a Média Móvel (janela de 3 buckets com amortecimento)
  const movingAvg: number[] = [];
  const thresholds: number[] = [];
  const anomalies: TimelineAnomaly[] = [];

  // Margem mínima de desvio padrão para evitar falsos positivos em volumes quase nulos
  const effectiveSigma = Math.max(stdDev, 1.0);

  for (let i = 0; i < n; i++) {
    // Janela móvel centrada/passada
    const start = Math.max(0, i - 1);
    const end = Math.min(n - 1, i + 1);
    const windowSlice = bucketCounts.slice(start, end + 1);
    const localAvg = windowSlice.reduce((acc, v) => acc + v, 0) / windowSlice.length;

    movingAvg.push(Math.round(localAvg * 10) / 10);

    // Limiar estatístico = Média Móvel + 2 Desvios Padrão (+2σ)
    const threshold = Math.round((localAvg + 2 * effectiveSigma) * 10) / 10;
    thresholds.push(threshold);

    const count = bucketCounts[i];
    // É anomalia se count > threshold E count >= 2 (evita sinalizar 1 evento como anomalia quando a média é 0)
    if (count > threshold && count >= 2) {
      const sigmaCount = effectiveSigma > 0 ? (count - localAvg) / effectiveSigma : 2.1;
      anomalies.push({
        bucket: labels[i],
        count,
        mean: localAvg,
        stdDev: effectiveSigma,
        threshold,
        sigmaCount: Math.round(sigmaCount * 10) / 10,
      });
    }
  }

  return {
    anomalies,
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    thresholds,
    movingAvg,
  };
}
