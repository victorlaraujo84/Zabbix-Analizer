import { ZabbixEvent, ZabbixFilters, ZabbixKPIs, ZabbixTriggerCatalogItem, ClientTriggerCatalog, ComparativeMetricsResult } from '../types/zabbix';
import { formatDuration } from './parser';

export const SEVERITY_COLORS: Record<string, string> = {
  Desastre: '#d32f2f',
  Alta: '#f57c00',
  Média: '#fbc02d',
  Atenção: '#1976d2',
  Informação: '#757575',
};

export const SEVERITY_ORDER = ['Desastre', 'Alta', 'Média', 'Atenção', 'Informação'];

/**
 * Aplica filtros reativos na lista de eventos, incluindo novos filtros de duração.
 */
export function filterEvents(events: ZabbixEvent[], filters: ZabbixFilters): ZabbixEvent[] {
  return events.filter((evt) => {
    // 1. Filtro de Período (Data/Hora de início do evento)
    if (filters.dateFrom && evt.dataInicio) {
      const fromTime = new Date(filters.dateFrom).getTime();
      if (evt.dataInicio.getTime() < fromTime) {
        return false;
      }
    }
    if (filters.dateTo && evt.dataInicio) {
      const toTime = new Date(filters.dateTo).getTime();
      if (evt.dataInicio.getTime() > toTime) {
        return false;
      }
    }

    // 2. Filtro de Severidade
    if (filters.severidades.length > 0 && !filters.severidades.includes(evt.severidade)) {
      return false;
    }

    // 3. Filtro de Host
    if (filters.hosts && filters.hosts.length > 0) {
      const safeEvtHost = typeof evt.host === 'object' && evt.host !== null ? ((evt.host as any).host || String(evt.host)) : String(evt.host || '');
      const matchHost = filters.hosts.some((h: any) => {
        const hStr = typeof h === 'object' && h !== null ? (h.host || String(h)) : String(h);
        return hStr === safeEvtHost;
      });
      if (!matchHost) return false;
    }

    // 4. Filtro de Trigger (Incidente)
    if (filters.triggers && filters.triggers.length > 0) {
      const safeEvtTrig = typeof evt.incidente === 'object' && evt.incidente !== null ? ((evt.incidente as any).trigger || (evt.incidente as any).name || String(evt.incidente)) : String(evt.incidente || '');
      const matchTrig = filters.triggers.some((t: any) => {
        const tStr = typeof t === 'object' && t !== null ? (t.trigger || t.name || String(t)) : String(t);
        return tStr === safeEvtTrig;
      });
      if (!matchTrig) return false;
    }

    // 5. Filtro de Status
    if (filters.status !== 'Todos' && evt.status !== filters.status) {
      return false;
    }

    // 6. Filtro de Reconhecido
    if (filters.reconhecido !== 'Todos' && evt.reconhecido !== filters.reconhecido) {
      return false;
    }

    // 7. Filtro por Etiquetas (Tags)
    if (filters.tagKey) {
      const tagVal = evt.etiquetas[filters.tagKey];
      if (tagVal === undefined) {
        return false;
      }
      if (filters.tagValues.length > 0 && !filters.tagValues.includes(tagVal)) {
        return false;
      }
    }

    // 8. Filtro por Duração (Presets de Ruído Operacional)
    if (filters.duracaoPreset && filters.duracaoPreset !== 'all') {
      const dur = evt.duracaoSegundos;
      if (filters.duracaoPreset === 'noise_1m' && dur >= 60) return false;
      if (filters.duracaoPreset === 'noise_5m' && (dur < 60 || dur >= 300)) return false;
      if (filters.duracaoPreset === 'medium_30m' && (dur < 300 || dur >= 1800)) return false;
      if (filters.duracaoPreset === 'long_2h' && (dur < 1800 || dur > 7200)) return false;
      if (filters.duracaoPreset === 'critical_2h' && dur <= 7200) return false;
    }

    // 9. Filtro por Duração Customizada Min/Max (em minutos)
    if (filters.duracaoMinMinutos.trim() !== '') {
      const minSec = parseFloat(filters.duracaoMinMinutos) * 60;
      if (!isNaN(minSec) && evt.duracaoSegundos < minSec) {
        return false;
      }
    }
    if (filters.duracaoMaxMinutos.trim() !== '') {
      const maxSec = parseFloat(filters.duracaoMaxMinutos) * 60;
      if (!isNaN(maxSec) && evt.duracaoSegundos > maxSec) {
        return false;
      }
    }

    // 10. Busca textual geral (Host, Incidente ou Etiquetas)
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase();
      const matchHost = evt.host.toLowerCase().includes(q);
      const matchInc = evt.incidente.toLowerCase().includes(q);
      const matchTags = evt.etiquetasTexto.toLowerCase().includes(q);
      const matchSev = evt.severidade.toLowerCase().includes(q);
      if (!matchHost && !matchInc && !matchTags && !matchSev) {
        return false;
      }
    }

    // 11. Filtro por Função Técnica Zabbix (Fase 3: nodata, last, diff, avg, etc.)
    if (filters.zabbixFunction && filters.zabbixFunction !== 'todas') {
      const fn = filters.zabbixFunction.toLowerCase();
      const expr = (evt.expressao || '').toLowerCase();
      const inc = evt.incidente.toLowerCase();
      // Verifica presença da função na expressão técnica ou no nome do incidente
      const hasFunctionInExpr = expr.includes(fn + '(') || expr.includes('.' + fn + '(');
      const hasFunctionInInc = inc.includes(fn + '(') || (fn === 'nodata' && (inc.includes('nodata') || inc.includes('sem dados') || inc.includes('comunicação') || inc.includes('inaccessible') || inc.includes('unreachable') || inc.includes('down')));
      if (!hasFunctionInExpr && !hasFunctionInInc) {
        return false;
      }
    }

    // 12. Filtro por Busca na Expressão Zabbix (Fase 3)
    if (filters.expressionQuery && filters.expressionQuery.trim()) {
      const eq = filters.expressionQuery.trim().toLowerCase();
      const expr = (evt.expressao || '').toLowerCase();
      const inc = evt.incidente.toLowerCase();
      if (!expr.includes(eq) && !inc.includes(eq)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Detecta se o evento corresponde a uma janela de manutenção programada ou preventiva.
 * Não entra como falha e sua duração deve ser deduzida do Uptime Planejado se intencional.
 */
export function isPlannedMaintenanceEvent(evt: ZabbixEvent): boolean {
  if (!evt) return false;
  const lowerInc = (evt.incidente || '').toLowerCase();
  const lowerActions = (evt.acoes || '').toLowerCase();
  const lowerTags = (evt.etiquetasTexto || '').toLowerCase();

  const maintenanceTerms = [
    'manutencao',
    'manutenção',
    'preventiva',
    'janela de manutencao',
    'janela de manutenção',
    'programada',
    'scheduled maintenance',
    'maintenance window',
    'parada programada',
  ];

  if (maintenanceTerms.some((t) => lowerInc.includes(t) || lowerActions.includes(t) || lowerTags.includes(t))) {
    return true;
  }

  if (evt.etiquetas) {
    for (const [k, v] of Object.entries(evt.etiquetas)) {
      const lowerK = k.toLowerCase();
      const lowerV = String(v).toLowerCase();
      if (
        lowerK.includes('manut') ||
        lowerK.includes('maint') ||
        lowerK.includes('prevent') ||
        lowerV.includes('manut') ||
        lowerV.includes('maint') ||
        lowerV.includes('prevent')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detecta se o evento corresponde a uma falha crítica de indisponibilidade (divisora do MTBF no NOC).
 * Conforme critérios de NOC:
 * 1. Severidade Desastre ou Alta/Alto.
 * 2. Qualquer alerta que gere indisponibilidade de serviço ou link (down, unreachable, offline, timeout, etc.).
 * 3. Exceto manutenções preventivas programadas.
 */
export function isCriticalOutageEvent(evt: ZabbixEvent): boolean {
  if (!evt) return false;
  if (isPlannedMaintenanceEvent(evt)) return false;

  const sev = (evt.severidade || '').trim();
  if (sev === 'Desastre' || sev === 'Alta' || sev === 'Alto') {
    return true;
  }

  const lowerInc = (evt.incidente || '').toLowerCase();
  const outageKeywords = [
    'down',
    'unreachable',
    'indisponivel',
    'indisponível',
    'indisponibilidade',
    'falha de link',
    'link down',
    'offline',
    'sem comunicacao',
    'sem comunicação',
    'inaccessible',
    'inacessivel',
    'inacessível',
    'timeout de conexao',
    'timeout de conexão',
    'interrupcao',
    'interrupção',
    'queda',
    'crash',
    'service stopped',
    'service unavailable',
    'host is down',
    'porta down',
    'falha de comunicacao',
    'falha de comunicação',
  ];

  return outageKeywords.some((kw) => lowerInc.includes(kw));
}

/**
 * Calcula os indicadores chave de desempenho (KPIs) com MTTR, MTBF e Taxa de Atuação.
 * O MTBF segue os critérios rigorosos de NOC:
 * MTBF = (Tempo Total de Operação Planejado 24x7 - Downtime Não Planejado) / Número de Falhas Críticas
 */
/**
 * Retorna a quantidade exata de dias de um determinado mês (ano e mês base 0).
 * Ex: Outubro (mês 9) -> 31 dias.
 * Ex: Setembro (mês 8) -> 30 dias.
 * Ex: Fevereiro 2024 -> 29 dias (bissexto), Fevereiro 2026 -> 28 dias.
 */
export function getDaysInMonth(year: number, monthZeroIndexed: number): number {
  return new Date(year, monthZeroIndexed + 1, 0).getDate();
}

export interface PeriodCalendarMetrics {
  totalDias: number;
  totalHoras: number;
  totalSegundos: number;
  label: string;
  mesReferencia: string;
}

/**
 * Calcula rigorosamente as horas e dias totais de operação planejada 24x7.
 * Conforme especificação:
 * - Se o mês analisado tiver 31 dias: 24 * 31 = 744 horas (2.678.400 segundos).
 * - Se o mês analisado tiver 30 dias: 24 * 30 = 720 horas (2.592.000 segundos).
 * - Se for Fevereiro: 24 * 28 = 672 horas (ou 696 horas em bissexto).
 * - Se for recorte de dias específico: quantidade de dias selecionados * 24 horas.
 */
export function calculatePeriodCalendarMetrics(
  events: ZabbixEvent[] = [],
  activeFilters?: Partial<ZabbixFilters>
): PeriodCalendarMetrics {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();

  const parseFilterDate = (str?: string) => {
    if (!str || typeof str !== 'string') return null;
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      m[4] ? parseInt(m[4], 10) : 0,
      m[5] ? parseInt(m[5], 10) : 0
    );
  };

  let startDate = parseFilterDate(activeFilters?.dateFrom);
  let endDate = parseFilterDate(activeFilters?.dateTo);

  if (!startDate || !endDate) {
    for (const evt of events) {
      if (evt.dataInicio) {
        if (!startDate || evt.dataInicio < startDate) startDate = evt.dataInicio;
        if (!endDate || evt.dataInicio > endDate) endDate = evt.dataInicio;
      }
    }
  }

  // Fallback se não houver datas em nenhum evento
  if (!startDate || !endDate) {
    const daysInCurrMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
    return {
      totalDias: daysInCurrMonth,
      totalHoras: daysInCurrMonth * 24,
      totalSegundos: daysInCurrMonth * 24 * 3600,
      label: `${daysInCurrMonth} dias (${daysInCurrMonth * 24}h)`,
      mesReferencia: `${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
    };
  }

  const sY = startDate.getFullYear();
  const sM = startDate.getMonth();
  const eY = endDate.getFullYear();
  const eM = endDate.getMonth();
  const daysInStartMonth = getDaysInMonth(sY, sM);

  // Período contido no mesmo mês e ano
  if (sY === eY && sM === eM) {
    const diffDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (86400 * 1000)) + 1);

    // Se o usuário selecionou o mês inteiro ou os eventos cobrem o mês (27+ dias ou do dia 1 ao fim)
    if (diffDays >= 27 || (startDate.getDate() <= 2 && endDate.getDate() >= daysInStartMonth - 1)) {
      const dias = daysInStartMonth;
      return {
        totalDias: dias,
        totalHoras: dias * 24,
        totalSegundos: dias * 24 * 3600,
        label: `${dias} dias (${dias * 24}h) - Mês Calendário`,
        mesReferencia: `${pad(sM + 1)}/${sY}`,
      };
    }

    // Recorte de dias específico dentro do mês
    const dias = diffDays;
    return {
      totalDias: dias,
      totalHoras: dias * 24,
      totalSegundos: dias * 24 * 3600,
      label: `${dias} dia${dias > 1 ? 's' : ''} (${dias * 24}h)`,
      mesReferencia: `${pad(sM + 1)}/${sY}`,
    };
  }

  // Período que abrange meses diferentes
  const diffDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (86400 * 1000)) + 1);
  return {
    totalDias: diffDays,
    totalHoras: diffDays * 24,
    totalSegundos: diffDays * 24 * 3600,
    label: `${diffDays} dias (${diffDays * 24}h)`,
    mesReferencia: `${pad(sM + 1)}/${sY} a ${pad(eM + 1)}/${eY}`,
  };
}

/**
 * Calcula os indicadores chave de desempenho (KPIs) com MTTR, MTBF e Disponibilidade Média.
 * O MTBF segue os critérios rigorosos de NOC:
 * MTBF = (Tempo Total de Operação Planejado 24x7 - Downtime Não Planejado) / Número de Falhas Críticas
 * A Disponibilidade Média do ambiente é a média aritmética da disponibilidade de cada host único no regime 24x7.
 */
export function computeKPIs(events: ZabbixEvent[], activeFilters?: Partial<ZabbixFilters>): ZabbixKPIs {
  const calendarMetrics = calculatePeriodCalendarMetrics(events, activeFilters);
  const totalEventos = events.length;

  if (totalEventos === 0) {
    return {
      totalEventos: 0,
      totalAbertos: 0,
      totalResolvidos: 0,
      duracaoTotalSegundos: 0,
      duracaoMediaSegundos: 0,
      hostMaisAfetado: { host: 'Nenhum', count: 0, duracaoSegundos: 0 },
      triggerMaisFrequente: { trigger: 'Nenhuma', count: 0 },
      mttrSegundos: 0,
      mtbfSegundosGlobal: 0,
      mtbfSegundosHostCritico: 0,
      totalReconhecidos: 0,
      taxaAtuacaoPercentual: 0,
      totalRuidoOperacional: 0,
      taxaDisponibilidadeMediaPct: 100,
      totalHorasPlanejadasPeriodo: calendarMetrics.totalHoras,
      totalDiasPeriodo: calendarMetrics.totalDias,
      disponibilidadePorHost: [],
      porSeveridade: {
        Desastre: 0,
        Alta: 0,
        Alto: 0,
        Média: 0,
        Médio: 0,
        Atenção: 0,
        Aviso: 0,
        Informação: 0,
        'Não classificada': 0,
      },
      mtbfDetails: {
        uptimePlanejadoSegundos: calendarMetrics.totalSegundos,
        downtimePlanejadoSegundos: 0,
        downtimeNaoPlanejadoSegundos: 0,
        uptimeEfetivoSegundos: calendarMetrics.totalSegundos,
        numeroFalhasCriticas: 0,
        taxaDisponibilidadePct: 100,
        totalDiasPeriodo: calendarMetrics.totalDias,
        totalHorasPlanejadasPeriodo: calendarMetrics.totalHoras,
      },
    };
  }

  let totalAbertos = 0;
  let duracaoTotalSegundos = 0;
  let duracaoResolvidosSegundos = 0;
  let totalResolvidos = 0;
  let totalReconhecidos = 0;
  let totalRuidoOperacional = 0;

  // Variáveis para o cálculo rigoroso de MTBF NOC
  let downtimePlanejadoSegundos = 0;
  let downtimeNaoPlanejadoSegundos = 0;
  let numeroFalhasCriticas = 0;

  const porSeveridade: Record<string, number> = {
    Desastre: 0,
    Alta: 0,
    Alto: 0,
    Média: 0,
    Médio: 0,
    Atenção: 0,
    Aviso: 0,
    Informação: 0,
    'Não classificada': 0,
  };

  const hostCounts = new Map<
    string,
    {
      count: number;
      duracaoSegundos: number;
      falhasCriticas: number;
      downtimeNaoPlanejado: number;
      downtimePlanejado: number;
    }
  >();
  const triggerCounts = new Map<string, number>();

  for (const evt of events) {
    duracaoTotalSegundos += evt.duracaoSegundos;

    // Contagem por severidade
    const sev = evt.severidade || 'Não classificada';
    porSeveridade[sev] = (porSeveridade[sev] || 0) + 1;
    if (sev === 'Alta') porSeveridade['Alto'] = (porSeveridade['Alto'] || 0) + 1;
    if (sev === 'Média') porSeveridade['Médio'] = (porSeveridade['Médio'] || 0) + 1;
    if (sev === 'Atenção') porSeveridade['Aviso'] = (porSeveridade['Aviso'] || 0) + 1;

    if (evt.status === 'INCIDENTE') {
      totalAbertos++;
    } else {
      totalResolvidos++;
      duracaoResolvidosSegundos += evt.duracaoSegundos;
    }

    if (evt.reconhecido === 'Sim') {
      totalReconhecidos++;
    }

    if (evt.duracaoSegundos < 300) {
      totalRuidoOperacional++;
    }

    // Classificação para cálculo do MTBF NOC e Disponibilidade
    const isMaintenance = isPlannedMaintenanceEvent(evt);
    const isOutage = isCriticalOutageEvent(evt);

    if (isMaintenance) {
      downtimePlanejadoSegundos += evt.duracaoSegundos;
    } else if (isOutage) {
      numeroFalhasCriticas++;
      downtimeNaoPlanejadoSegundos += evt.duracaoSegundos;
    }

    // Contagem por host (garante chave string limpa)
    const safeHost =
      typeof evt.host === 'object' && evt.host !== null
        ? ((evt.host as any).host || String(evt.host))
        : String(evt.host || 'Host Desconhecido');
    const hData = hostCounts.get(safeHost) || {
      count: 0,
      duracaoSegundos: 0,
      falhasCriticas: 0,
      downtimeNaoPlanejado: 0,
      downtimePlanejado: 0,
    };
    hData.count++;
    hData.duracaoSegundos += evt.duracaoSegundos;
    if (isMaintenance) {
      hData.downtimePlanejado += evt.duracaoSegundos;
    } else if (isOutage) {
      hData.falhasCriticas++;
      hData.downtimeNaoPlanejado += evt.duracaoSegundos;
    }
    hostCounts.set(safeHost, hData);

    // Contagem por trigger (garante chave string)
    const safeTrigger =
      typeof evt.incidente === 'object' && evt.incidente !== null
        ? ((evt.incidente as any).trigger || (evt.incidente as any).name || String(evt.incidente))
        : String(evt.incidente || 'Incidente sem descrição');
    triggerCounts.set(safeTrigger, (triggerCounts.get(safeTrigger) || 0) + 1);
  }

  // Host mais afetado em volume
  let topHost = 'Nenhum';
  let topHostCount = 0;
  let topHostDuracao = 0;
  let topHostFalhasCriticas = 0;
  let topHostDowntimeNaoPlanejado = 0;
  let topHostDowntimePlanejado = 0;

  for (const [h, data] of hostCounts.entries()) {
    if (data.count > topHostCount) {
      topHostCount = data.count;
      topHost = typeof h === 'object' && h !== null ? ((h as any).host || String(h)) : String(h);
      topHostDuracao = data.duracaoSegundos;
      topHostFalhasCriticas = data.falhasCriticas;
      topHostDowntimeNaoPlanejado = data.downtimeNaoPlanejado;
      topHostDowntimePlanejado = data.downtimePlanejado;
    }
  }

  // Trigger mais frequente
  let topTrigger = 'Nenhuma';
  let topTriggerCount = 0;
  for (const [t, count] of triggerCounts.entries()) {
    if (count > topTriggerCount) {
      topTriggerCount = count;
      topTrigger =
        typeof t === 'object' && t !== null
          ? ((t as any).trigger || (t as any).name || String(t))
          : String(t);
    }
  }

  const duracaoMediaSegundos = Math.round(duracaoTotalSegundos / totalEventos);
  const mttrSegundos = totalResolvidos > 0 ? Math.round(duracaoResolvidosSegundos / totalResolvidos) : 0;
  const taxaAtuacaoPercentual = Math.round((totalReconhecidos / totalEventos) * 100);

  // ========================================================
  // CÁLCULO DE DISPONIBILIDADE MULTI-HOST E MTBF RIGOROSO NOC:
  // Base horas: 744h (31 dias), 720h (30 dias), 672/696h (Fev) ou dias selecionados
  // ========================================================
  const windowSeconds = calendarMetrics.totalSegundos;

  // Calcula a disponibilidade individual de cada host único
  const disponibilidadePorHost: Array<{
    host: string;
    disponibilidadePct: number;
    downtimeSegundos: number;
    falhasCriticas: number;
  }> = [];

  for (const [h, data] of hostCounts.entries()) {
    const hostPlanned = Math.max(1, windowSeconds - data.downtimePlanejado);
    const hostEffective = Math.max(0, hostPlanned - data.downtimeNaoPlanejado);
    const hostDispPct = Math.min(
      100,
      Math.max(0, Number(((hostEffective / hostPlanned) * 100).toFixed(2)))
    );
    disponibilidadePorHost.push({
      host: h,
      disponibilidadePct: hostDispPct,
      downtimeSegundos: data.downtimeNaoPlanejado,
      falhasCriticas: data.falhasCriticas,
    });
  }

  // Ordena por menor disponibilidade (principais ofensores de SLA primeiro)
  disponibilidadePorHost.sort((a, b) => a.disponibilidadePct - b.disponibilidadePct);

  // Disponibilidade Média do Ambiente = Média aritmética de cada host
  let taxaDisponibilidadeMediaPct = 100;
  if (disponibilidadePorHost.length > 0) {
    const sumAvail = disponibilidadePorHost.reduce((acc, curr) => acc + curr.disponibilidadePct, 0);
    taxaDisponibilidadeMediaPct = Number(
      (sumAvail / disponibilidadePorHost.length).toFixed(2)
    );
  }

  // Uptime Efetivo Médio do Ambiente para o MTBF Global
  const uptimePlanejadoLiquido = Math.max(
    1,
    windowSeconds - Math.round(downtimePlanejadoSegundos / Math.max(1, hostCounts.size))
  );
  const uptimeEfetivoGlobal = Math.max(
    0,
    Math.round((taxaDisponibilidadeMediaPct / 100) * uptimePlanejadoLiquido)
  );

  // MTBF Global = Tempo efetivo médio em operação / Número de falhas críticas
  let mtbfSegundosGlobal = 0;
  if (numeroFalhasCriticas > 0) {
    mtbfSegundosGlobal = Math.round(uptimeEfetivoGlobal / numeroFalhasCriticas);
  } else {
    mtbfSegundosGlobal = uptimeEfetivoGlobal;
  }

  // MTBF Host Crítico
  const uptimePlanejadoHostCritico = Math.max(1, windowSeconds - topHostDowntimePlanejado);
  const uptimeEfetivoHost = Math.max(0, uptimePlanejadoHostCritico - topHostDowntimeNaoPlanejado);
  let mtbfSegundosHostCritico = 0;
  if (topHostFalhasCriticas > 0) {
    mtbfSegundosHostCritico = Math.round(uptimeEfetivoHost / topHostFalhasCriticas);
  } else {
    mtbfSegundosHostCritico = uptimeEfetivoHost;
  }

  return {
    totalEventos,
    totalAbertos,
    totalResolvidos,
    duracaoTotalSegundos,
    duracaoMediaSegundos,
    hostMaisAfetado: { host: topHost, count: topHostCount, duracaoSegundos: topHostDuracao },
    triggerMaisFrequente: { trigger: topTrigger, count: topTriggerCount },
    mttrSegundos,
    mtbfSegundosGlobal,
    mtbfSegundosHostCritico,
    totalReconhecidos,
    taxaAtuacaoPercentual,
    totalRuidoOperacional,
    taxaDisponibilidadeMediaPct,
    totalHorasPlanejadasPeriodo: calendarMetrics.totalHoras,
    totalDiasPeriodo: calendarMetrics.totalDias,
    disponibilidadePorHost,
    porSeveridade,
    mtbfDetails: {
      uptimePlanejadoSegundos: windowSeconds,
      downtimePlanejadoSegundos,
      downtimeNaoPlanejadoSegundos,
      uptimeEfetivoSegundos: uptimeEfetivoGlobal,
      numeroFalhasCriticas,
      taxaDisponibilidadePct: taxaDisponibilidadeMediaPct,
      totalDiasPeriodo: calendarMetrics.totalDias,
      totalHorasPlanejadasPeriodo: calendarMetrics.totalHoras,
    },
  };
}

/**
 * Gera automaticamente as 3 conclusões executivas principais
 */
export function generateExecutiveSummary(events: ZabbixEvent[], kpis: ZabbixKPIs): string[] {
  if (events.length === 0) {
    return [
      'Nenhum incidente localizado com os filtros selecionados.',
      'Ajuste os parâmetros ou limpe os filtros para visualizar os dados.',
      'Aguardando novos eventos.',
    ];
  }

  const conclusions: string[] = [];

  // Conclusão 1: Host mais afetado e MTBF do host
  const pctHost = Math.round((kpis.hostMaisAfetado.count / kpis.totalEventos) * 100);
  conclusions.push(
    `O host "${kpis.hostMaisAfetado.host}" concentra ${kpis.hostMaisAfetado.count} eventos (${pctHost}% do total) com MTBF individual de ${formatDuration(kpis.mtbfSegundosHostCritico)}.`
  );

  // Conclusão 2: Ruído operacional e taxa de atuação
  const pctRuido = Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100);
  conclusions.push(
    `${kpis.totalRuidoOperacional} alarmes (${pctRuido}%) duraram menos de 5 min (potencial ruído/flapping). Taxa de atuação do NOC é de ${kpis.taxaAtuacaoPercentual}% de alarmes reconhecidos.`
  );

  // Conclusão 3: Confiabilidade, MTTR e backlog aberto
  if (kpis.totalAbertos > 0) {
    conclusions.push(
      `Existem ${kpis.totalAbertos} incidente(s) em aberto sem recuperação. O MTTR médio consolidado é de ${formatDuration(kpis.mttrSegundos)} e o MTBF global é de ${formatDuration(kpis.mtbfSegundosGlobal)}.`
    );
  } else {
    conclusions.push(
      `100% dos incidentes estão resolvidos. MTTR atingiu ${formatDuration(kpis.mttrSegundos)} e o MTBF global da infraestrutura é de ${formatDuration(kpis.mtbfSegundosGlobal)}.`
    );
  }

  return conclusions;
}

/**
 * Formata um bloco em Markdown documentando explicitamente todos os filtros ativos
 */
export function formatActiveFiltersSummary(
  filters: ZabbixFilters,
  rawTotal: number,
  filteredTotal: number
): string {
  const lines: string[] = [];

  // Período
  if (filters.dateFrom || filters.dateTo) {
    const fromStr = filters.dateFrom ? filters.dateFrom.replace('T', ' ') : 'Início do histórico';
    const toStr = filters.dateTo ? filters.dateTo.replace('T', ' ') : 'Fim do histórico';
    lines.push(`- **Período Selecionado:** De ${fromStr} até ${toStr}`);
  } else {
    lines.push('- **Período Selecionado:** Todo o período disponível no relatório');
  }

  // Hosts
  if (filters.hosts && filters.hosts.length > 0) {
    lines.push(`- **Hosts Filtrados (${filters.hosts.length}):** ${filters.hosts.join(', ')}`);
  } else {
    lines.push('- **Hosts:** Todos os hosts da base');
  }

  // Severidades
  if (filters.severidades && filters.severidades.length > 0) {
    lines.push(`- **Severidades Selecionadas:** ${filters.severidades.join(', ')}`);
  } else {
    lines.push('- **Severidades:** Todas as severidades');
  }

  // Triggers
  if (filters.triggers && filters.triggers.length > 0) {
    lines.push(`- **Triggers Específicas (${filters.triggers.length}):** ${filters.triggers.slice(0, 3).join(', ')}${filters.triggers.length > 3 ? '...' : ''}`);
  } else {
    lines.push('- **Triggers:** Todas as triggers');
  }

  // Status
  lines.push(`- **Status dos Incidentes:** ${filters.status === 'Todos' ? 'Todos (Resolvidos + Em Aberto)' : filters.status}`);

  // Reconhecido (Ack)
  lines.push(`- **Reconhecimento (Ack):** ${filters.reconhecido === 'Todos' ? 'Todos (Reconhecidos e Não Reconhecidos)' : filters.reconhecido}`);

  // Filtro de Duração
  if (filters.duracaoPreset !== 'all') {
    const labels: Record<string, string> = {
      noise_1m: '< 1 min (Flapping Severo)',
      noise_5m: '1 a 5 min (Ruído Operacional)',
      medium_30m: '5 a 30 min',
      long_2h: '30 min a 2 horas',
      critical_2h: '> 2 horas (Crítico)',
    };
    lines.push(`- **Filtro de Duração:** ${labels[filters.duracaoPreset] || filters.duracaoPreset}`);
  } else if (filters.duracaoMinMinutos || filters.duracaoMaxMinutos) {
    const minStr = filters.duracaoMinMinutos ? `>= ${filters.duracaoMinMinutos} min` : '';
    const maxStr = filters.duracaoMaxMinutos ? `<= ${filters.duracaoMaxMinutos} min` : '';
    lines.push(`- **Filtro de Duração Customizado:** ${[minStr, maxStr].filter(Boolean).join(' e ')}`);
  } else {
    lines.push('- **Filtro de Duração:** Qualquer duração');
  }

  // Etiquetas (Tags)
  if (filters.tagKey) {
    const valStr = filters.tagValues && filters.tagValues.length > 0 ? filters.tagValues.join(', ') : 'Qualquer valor';
    lines.push(`- **Etiquetas (Tags):** Chave "${filters.tagKey}" = [${valStr}]`);
  } else {
    lines.push('- **Etiquetas (Tags):** Sem restrição de tags');
  }

  // Busca textual
  if (filters.searchQuery && filters.searchQuery.trim()) {
    lines.push(`- **Busca Textual Ativa:** "${filters.searchQuery.trim()}"`);
  }

  // Proporção do Escopo
  lines.push(`- **Amostra Analisada:** **${filteredTotal} de ${rawTotal} eventos** (${rawTotal > 0 ? Math.round((filteredTotal / rawTotal) * 100) : 0}% do dataset completo)`);

  return lines.join('\n');
}

/**
 * Busca a expressão de trigger correspondente no catálogo do cliente por Host e Incidente/Trigger.
 */
export function findTriggerExpression(
  host: string,
  incidente: string,
  catalog?: ClientTriggerCatalog | null
): ZabbixTriggerCatalogItem | undefined {
  if (!catalog || !catalog.items || catalog.items.length === 0) return undefined;

  const hNorm = (host || '').trim().toLowerCase();
  const iNorm = (incidente || '').trim().toLowerCase();

  // 1. Busca exata por host e incidente/nome
  let match = catalog.items.find(
    (item) => item.host.trim().toLowerCase() === hNorm && item.name.trim().toLowerCase() === iNorm
  );
  if (match) return match;

  // 2. Busca aproximada por host (se contiver hostname base) e nome idêntico
  match = catalog.items.find((item) => {
    const itemH = item.host.trim().toLowerCase();
    const itemN = item.name.trim().toLowerCase();
    const hostMatch = itemH === hNorm || (itemH && (hNorm.includes(itemH) || itemH.includes(hNorm)));
    return hostMatch && itemN === iNorm;
  });
  if (match) return match;

  // 3. Fallback: trigger name exato se for template global
  match = catalog.items.find((item) => item.name.trim().toLowerCase() === iNorm);
  return match;
}

/**
 * Gera Prompt estruturado para IA sugerir ajustes e tuning em triggers Zabbix
 * rigorosamente alinhado com o que está filtrado/selecionado pelo usuário
 * e enriquecido com as expressões reais da planilha caso disponíveis.
 */
export function generateTriggerTuningPrompt(
  events: ZabbixEvent[],
  kpis: ZabbixKPIs,
  filters: ZabbixFilters,
  rawTotal: number,
  catalog?: ClientTriggerCatalog | null
): string {
  const scopeSummary = formatActiveFiltersSummary(filters, rawTotal, events.length);

  // Determina contexto e persona adaptados aos filtros ativos
  let contextualFocus = 'geral de todo o ambiente de monitoramento Zabbix';
  let specificDirective = '';

  if (filters.hosts.length === 1) {
    contextualFocus = `dedicado exclusivamente ao host **"${filters.hosts[0]}"**`;
    specificDirective = `\n**ATENÇÃO ESPECIAL**: Este relatório foi filtrado unicamente para o host **"${filters.hosts[0]}"**. Concentre 100% das suas recomendações na arquitetura deste servidor e seus templates/itens associados.`;
  } else if (filters.hosts.length > 1) {
    contextualFocus = `focado no grupo de ${filters.hosts.length} hosts selecionados (${filters.hosts.slice(0, 3).join(', ')}${filters.hosts.length > 3 ? '...' : ''})`;
  } else if (filters.status === 'INCIDENTE') {
    contextualFocus = 'focado estritamente em incidentes que continuam **EM ABERTO** (sem recuperação)';
    specificDirective = `\n**MODO SALA DE CRISE**: Os eventos abaixo representam incidentes não resolvidos no ambiente. Priorize ações para identificar travamentos permanentes e dependências não recuperadas.`;
  } else if (filters.duracaoPreset === 'noise_1m' || filters.duracaoPreset === 'noise_5m') {
    contextualFocus = 'focado especificamente em incidentes de curtíssima duração (Ruído Operacional / Flapping)';
    specificDirective = `\n**FOCO EM SUPRESSÃO DE FLAPPING**: O usuário filtrou exclusivamente alertas de curtíssima duração. O principal objetivo é elevar limiares de tempo e implementar hysteresis para eliminar 100% dos falsos positivos.`;
  } else if (filters.severidades.length > 0 && filters.severidades.every((s) => s === 'Desastre' || s === 'Alta')) {
    contextualFocus = 'focado em incidentes de alta e altíssima criticidade (Desastre / Alta)';
    specificDirective = `\n**FOCO EM CRITICIDADE MÁXIMA**: Trata-se de incidentes severos de produção. As expressões de trigger devem balancear rápida detecção com blindagem contra falsos alarmes.`;
  }

  // Identifica triggers com duração < 5m e alta frequência
  const noiseTriggers = new Map<string, { count: number; hosts: Set<string>; severities: Set<string>; avgDur: number; totalDur: number }>();

  for (const e of events) {
    if (e.duracaoSegundos < 300 || e.duracaoTexto.includes('m') || e.duracaoTexto.includes('s')) {
      const item = noiseTriggers.get(e.incidente) || {
        count: 0,
        hosts: new Set<string>(),
        severities: new Set<string>(),
        avgDur: 0,
        totalDur: 0,
      };
      item.count++;
      item.hosts.add(e.host);
      item.severities.add(e.severidade);
      item.totalDur += e.duracaoSegundos;
      noiseTriggers.set(e.incidente, item);
    }
  }

  const topNoise = Array.from(noiseTriggers.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 7)
    .map(([trigger, data]) => {
      const avgSec = Math.round(data.totalDur / data.count);
      const firstHost = Array.from(data.hosts)[0] || '';
      // Procura primeiro a expressão vinda diretamente da planilha (coluna Expressão das 15 colunas)
      const eventWithExpr = events.find((ev) => ev.incidente === trigger && ev.expressao);
      const directExpr = eventWithExpr?.expressao;
      const matchedCatalogItem = directExpr
        ? { expression: directExpr }
        : findTriggerExpression(firstHost, trigger, catalog);
      const exprBlock = matchedCatalogItem
        ? `\n  - **Expressão Real Atual no Zabbix:** \`${matchedCatalogItem.expression}\``
        : '';

      return `- **Trigger**: "${trigger}"\n  - Ocorrências no escopo: ${data.count} vezes\n  - Duração média da falha: ${formatDuration(avgSec)}\n  - Hosts impactados (${data.hosts.size}): ${Array.from(data.hosts).slice(0, 3).join(', ')}${data.hosts.size > 3 ? '...' : ''}\n  - Severidades: ${Array.from(data.severities).join(', ')}${exprBlock}`;
    });

  const hasDirectExpressions = events.some((e) => !!e.expressao);
  const catalogAvailableInfo = hasDirectExpressions || (catalog && catalog.items.length > 0)
    ? `\n---\n\n### EXPRESSÕES TÉCNICAS REAIS DO ZABBIX MAPEADAS DA PLANILHA:\nPara as triggers com "**Expressão Real Atual no Zabbix**", realize uma análise criteriosa e tuning cirúrgico direto sobre a fórmula matemática do Zabbix, apontando os parâmetros de amostragem (\`#3\`, tempo de histerese) e funções que devem ser refatoradas.`
    : '';

  return `# PROMPT PARA ENGENHARIA E TUNING DE TRIGGERS ZABBIX

Você é um Engenheiro Sênior de Observabilidade e Especialista Certificado Zabbix (Zabbix Certified Expert / SRE).

Gerei uma análise de incidentes no painel Zabbix Analyzer com um recorte ${contextualFocus}.${specificDirective}

---

### ESCOPO DOS FILTROS APLICADOS NESTA ANÁLISE:
${scopeSummary}

---

### MÉTRICAS DO ESCOPO FILTRADO:
- Total de eventos no escopo: ${kpis.totalEventos}
- Alarmes de curta duração (< 5 min): ${kpis.totalRuidoOperacional} (${kpis.totalEventos > 0 ? Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100) : 0}% do escopo)
- Taxa de reconhecimento (Ack): ${kpis.taxaAtuacaoPercentual}%
- MTTR médio do escopo: ${formatDuration(kpis.mttrSegundos)}
- MTBF no escopo: ${formatDuration(kpis.mtbfSegundosGlobal)}
- Host mais afetado: "${kpis.hostMaisAfetado.host}" (${kpis.hostMaisAfetado.count} eventos)
${catalogAvailableInfo}

---

### TOP TRIGGERS COM COMPORTAMENTO DE RUÍDO / FLAPPING NO ESCOPO:
${topNoise.length > 0 ? topNoise.join('\n\n') : 'Nenhuma trigger de curta duração encontrada com os filtros atuais.'}

---

### SUAS TAREFAS COMO ESPECIALISTA ZABBIX:
1. **Diagnóstico dos Alarmes Filtrados**:
   - Analise especificamente as triggers e hosts identificados no escopo acima.
   - Explique a causa física/lógica provável para a oscilação desses itens sob a perspectiva do escopo filtrado.
2. **Engenharia de Expressões Zabbix Otimizadas (Zabbix 6.x/7.x)**:
   - Forneça a sintaxe exata e ajustada para cada trigger problemática, refatorando diretamente as expressões reais do cliente se informadas.
   - Substitua chamadas sensíveis \`last()\` por funções de agregação temporal ou amostragem expandida: \`min(/host/item, 5m)\`, \`avg(/host/item, 10m)\`, ou \`count(/host/item, #5,"ne",0) >= 4\`.
3. **Estratégia de Hysteresis (Expressão de Problema vs Expressão de Recuperação)**:
   - Para evitar reaberturas sucessivas, forneça o par de expressões:
     - **Problem Expression**: Condição rigorosa de ativação.
     - **Recovery Expression**: Condição de estabilização prolongada antes de encerrar o alarme.
4. **Dependências e Tags**:
   - Indique dependências de triggers recomendadas (ex: se o agente ou link cair, suprimir alarmes dos serviços internos).
   - Sugira tags de governança padronizadas (ex: \`scope\`, \`criticality\`, \`team\`).
5. **Passo a Passo Prático de Configuração**:
   - Liste 3 ações imediatas que o operador Zabbix deve executar no frontend para sanar as anomalias desse recorte.`;
}

/**
 * Gera Prompt estruturado para IA redigir um Resumo Executivo Formal
 * rigorosamente alinhado com o que está filtrado/selecionado pelo usuário.
 */
export function generateExecutiveReportPrompt(
  events: ZabbixEvent[],
  kpis: ZabbixKPIs,
  filters: ZabbixFilters,
  rawTotal: number
): string {
  const scopeSummary = formatActiveFiltersSummary(filters, rawTotal, events.length);

  // Distribuição por severidade no escopo
  const sevCounts: Record<string, number> = {};
  for (const s of SEVERITY_ORDER) sevCounts[s] = 0;
  for (const e of events) sevCounts[e.severidade] = (sevCounts[e.severidade] || 0) + 1;
  const sevSummary = SEVERITY_ORDER.map((s) => `${s}: ${sevCounts[s]}`).join(' | ');

  // Adapta o objetivo do relatório com base no que está selecionado
  let reportType = 'Relatório Geral de Saúde de Infraestrutura e Incidentes';
  let audienceNote = 'Diretoria de Tecnologia (CIO) e Gerência de Operações de TI';

  if (filters.hosts.length === 1) {
    reportType = `Relatório Executivo de Auditoria do Servidor: ${filters.hosts[0]}`;
    audienceNote = `Squad Responsável pelo Host ${filters.hosts[0]} e Liderança de Infraestrutura`;
  } else if (filters.status === 'INCIDENTE') {
    reportType = 'Relatório Executivo de Crise (War Room) - Backlog de Incidentes Não Resolvidos';
    audienceNote = 'Comitê de Crise e Gestão de Incidentes Críticos';
  } else if (filters.duracaoPreset === 'noise_1m' || filters.duracaoPreset === 'noise_5m') {
    reportType = 'Relatório Executivo de Eficiência e Impacto de Ruído Operacional no NOC';
    audienceNote = 'Coordenação de NOC, SRE e Governança de Monitoramento';
  }

  return `# PROMPT PARA REDAÇÃO DE ${reportType.toUpperCase()}

Você é um Consultor Estratégico de TI e Diretor de Confiabilidade de Sistemas (ITIL v4 / SRE Director).

Redija um **${reportType}** formal destinado a **${audienceNote}**, fundamentado estritamente nos dados delimitados pelos filtros ativos aplicados no painel Zabbix Analyzer.

---

### ESCOPO DOS FILTROS APLICADOS NESTA ANÁLISE:
${scopeSummary}

---

### DADOS CONSOLIDADOS DO RECORTE ANALISADO:
- **Volume de Incidentes no Escopo:** ${kpis.totalEventos} eventos (${rawTotal > 0 ? Math.round((kpis.totalEventos / rawTotal) * 100) : 0}% do relatório total de ${rawTotal} eventos)
- **Incidentes em Aberto:** ${kpis.totalAbertos} ${kpis.totalAbertos > 0 ? '(EXIGE INTERVENÇÃO IMEDIATA)' : '(100% resolvidos no escopo)'}
- **Incidentes Resolvidos:** ${kpis.totalResolvidos}
- **Duração Total Acumulada de Indisponibilidade:** ${formatDuration(kpis.duracaoTotalSegundos)}
- **Duração Média por Incidente:** ${formatDuration(kpis.duracaoMediaSegundos)}
- **MTTR (Mean Time To Resolve):** ${formatDuration(kpis.mttrSegundos)}
- **MTBF (Mean Time Between Failures - Padrão NOC):** ${formatDuration(kpis.mtbfSegundosGlobal)}
  * Uptime Planejado 24x7: ${formatDuration(kpis.mtbfDetails?.uptimePlanejadoSegundos || 0)}
  * Downtime Não Planejado: ${formatDuration(kpis.mtbfDetails?.downtimeNaoPlanejadoSegundos || 0)}
  * Falhas Críticas de Indisponibilidade: ${kpis.mtbfDetails?.numeroFalhasCriticas || 0}
  * Disponibilidade Efetiva Calculada: ${kpis.mtbfDetails?.taxaDisponibilidadePct ?? 100}%
- **Taxa de Atuação Operacional (Ack):** ${kpis.taxaAtuacaoPercentual}% dos eventos foram reconhecidos pelo NOC
- **Host Mais Afetado no Escopo:** "${kpis.hostMaisAfetado.host}" com ${kpis.hostMaisAfetado.count} eventos (MTBF individual: ${formatDuration(kpis.mtbfSegundosHostCritico)})
- **Trigger Mais Recorrente no Escopo:** "${kpis.triggerMaisFrequente.trigger}" (${kpis.triggerMaisFrequente.count} ocorrências)
- **Distribuição de Severidade:** ${sevSummary}
- **Alarmes de Ruído (< 5 min):** ${kpis.totalRuidoOperacional} ocorrências (${kpis.totalEventos > 0 ? Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100) : 0}% deste escopo)

---

### DIRETRIZES DE REDAÇÃO DO RELATÓRIO:
1. **Sumário Executivo (Executive Summary)**:
   - Apresente um resumo claro e executivo explicitando que este diagnóstico refere-se estritamente ao escopo dos filtros delimitados (especialmente os hosts, período ou severidades selecionados).
2. **Avaliação da Saúde Operacional & SLA**:
   - Analise criticamente o MTTR de ${formatDuration(kpis.mttrSegundos)} e a taxa de atuação do NOC (${kpis.taxaAtuacaoPercentual}%).
   - Avalie se os números indicam sobrecarga da equipe, problemas estruturais de capacidade ou falta de processos automatizados.
3. **Análise de Causa Raiz e Concentração de Risco**:
   - Aprofunde o diagnóstico do host "${kpis.hostMaisAfetado.host}" e da trigger "${kpis.triggerMaisFrequente.trigger}".
4. **Impacto Operacional e Fadiga de Alertas**:
   - Exponha o custo operacional decorrente dos ${kpis.totalRuidoOperacional} alarmes de curta duração no escopo.
5. **Recomendações e Plano de Ação Estratégico**:
   - Liste 3 ações prioritárias imediatas (quick wins) e 2 ações estruturais de médio prazo para a liderança técnica.

Adote tom executivo, objetivo, elegante e analítico, sem floreios desnecessários e mantendo coerência absoluta com os filtros informados.`;
}

/**
 * Gera Prompt estruturado para o "Book de Resultados Estratégicos" (Executivo + Técnico Unificado)
 * Consolida governança C-Level, SLA, diagnóstico cirúrgico de flapping Zabbix 7.0 e roadmap integrado.
 */
export function generateBookDeResultadosPrompt(
  events: ZabbixEvent[],
  kpis: ZabbixKPIs,
  filters: ZabbixFilters,
  rawTotal: number,
  catalog?: ClientTriggerCatalog | null,
  customDirectives?: string
): string {
  const scopeSummary = formatActiveFiltersSummary(filters, rawTotal, events.length);

  // Severidades
  const sevCounts: Record<string, number> = {};
  for (const s of SEVERITY_ORDER) sevCounts[s] = 0;
  for (const e of events) sevCounts[e.severidade] = (sevCounts[e.severidade] || 0) + 1;
  const sevSummary = SEVERITY_ORDER.map((s) => `${s}: ${sevCounts[s]}`).join(' | ');

  // Top 5 ofensores com severidades e expressões se disponíveis
  const hostStats = new Map<string, { count: number; dur: number; sev: Set<string> }>();
  for (const e of events) {
    const h = typeof e.host === 'object' && e.host !== null ? (e.host as any).host : String(e.host || '');
    if (!h) continue;
    const item = hostStats.get(h) || { count: 0, dur: 0, sev: new Set<string>() };
    item.count++;
    item.dur += e.duracaoSegundos;
    item.sev.add(e.severidade);
    hostStats.set(h, item);
  }
  const topHosts = Array.from(hostStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([h, data]) => `- **${h}**: ${data.count} incidentes (${formatDuration(data.dur)} acumulados) · Severidades: ${Array.from(data.sev).join(', ')}`);

  // Top triggers de flapping
  const triggerStats = new Map<string, { count: number; dur: number; host: string }>();
  for (const e of events) {
    const t = typeof e.incidente === 'object' && e.incidente !== null ? (e.incidente as any).trigger || String(e.incidente) : String(e.incidente || '');
    if (!t) continue;
    const item = triggerStats.get(t) || { count: 0, dur: 0, host: String(e.host || '') };
    item.count++;
    item.dur += e.duracaoSegundos;
    triggerStats.set(t, item);
  }
  const topTriggers = Array.from(triggerStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([t, data]) => {
      const avgSec = Math.round(data.dur / data.count);
      const matchedCatalogItem = findTriggerExpression(data.host, t, catalog);
      const exprStr = matchedCatalogItem ? `\n    * Expressão Zabbix mapeada: \`${matchedCatalogItem.expression}\`` : '';
      return `- **"${t}"** (${data.count} ocorrências, média: ${formatDuration(avgSec)})${exprStr}`;
    });

  const customBlock = customDirectives && customDirectives.trim()
    ? `\n---\n\n### DIRETRIZES ESPECÍFICAS INFORMADAS PELO AUDITOR:\n${customDirectives.trim()}\n`
    : '';

  return `# PROMPT: BOOK DE RESULTADOS ESTRATÉGICOS (EXECUTIVO & TÉCNICO UNIFICADO)
Você é um Arquiteto Principal de Observabilidade e Consultor Sênior de Estratégia de TI (Zabbix Certified Expert & ITIL v4 Master).

Elabore o **BOOK DE RESULTADOS DE OBSERVABILIDADE & CONFIABILIDADE**, um relatório de alto impacto que unifica rigorosamente a visão estratégica de Diretoria (C-Level/CIO) com a precisão cirúrgica de Engenharia de Confiabilidade (SRE/Zabbix 7.0).

---

### ESCOPO DOS FILTROS APLICADOS NESTA AUDITORIA:
${scopeSummary}
${customBlock}
---

### INDICADORES MACRO CONSOLIDADOS (C-LEVEL):
- **Incidentes Registrados no Escopo:** ${kpis.totalEventos} (${rawTotal > 0 ? Math.round((kpis.totalEventos / rawTotal) * 100) : 0}% de ${rawTotal} eventos da base)
- **Status Operacional:** ${kpis.totalAbertos} abertos (${kpis.totalAbertos > 0 ? 'CRÍTICO' : 'Normalizado'}) | ${kpis.totalResolvidos} resolvidos
- **Indisponibilidade Acumulada:** ${formatDuration(kpis.duracaoTotalSegundos)}
- **MTTR Médio:** ${formatDuration(kpis.mttrSegundos)}
- **MTBF Consolidado (Critérios NOC):** ${formatDuration(kpis.mtbfSegundosGlobal)}
  * Uptime Planejado 24x7: ${formatDuration(kpis.mtbfDetails?.uptimePlanejadoSegundos || 0)}
  * Downtime Não Planejado: ${formatDuration(kpis.mtbfDetails?.downtimeNaoPlanejadoSegundos || 0)}
  * Falhas Críticas de Indisponibilidade: ${kpis.mtbfDetails?.numeroFalhasCriticas || 0}
  * Disponibilidade Efetiva do Período: ${kpis.mtbfDetails?.taxaDisponibilidadePct ?? 100}%
- **Taxa de Atendimento NOC (Ack):** ${kpis.taxaAtuacaoPercentual}% dos alertas foram reconhecidos
- **Índice de Ruído (< 5 min):** ${kpis.totalRuidoOperacional} eventos (${kpis.totalEventos > 0 ? Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100) : 0}% dos alarmes se autorresolveram)
- **Distribuição de Severidade:** ${sevSummary}

---

### TOP 5 OFENSORES DE INFRAESTRUTURA:
${topHosts.length > 0 ? topHosts.join('\n') : 'Nenhum ofensor isolado encontrado.'}

---

### TOP TRIGGERS COM PADRÃO DE FLAPPING / OSCILAÇÃO:
${topTriggers.length > 0 ? topTriggers.join('\n') : 'Nenhuma trigger crítica de ruído identificada.'}

---

### ESTRUTURA OBRIGATÓRIA DO BOOK DE RESULTADOS (4 PILARES):

1. **PILAR I: SUMÁRIO EXECUTIVO & GOVERNANÇA DE NEGÓCIO (C-LEVEL)**
   - Parecer de estabilidade, impacto financeiro/produtividade e conformidade de SLA.
   - Avaliação do ruído operacional de ${kpis.totalRuidoOperacional} incidentes no custo humano da equipe.

2. **PILAR II: MATRIZ DE OFENSORES & DIAGNÓSTICO DE CAUSA RAIZ**
   - Análise detalhada dos servidores que concentram incidentes, em especial "${kpis.hostMaisAfetado?.host || 'Hosts mais impactados'}".
   - Correlação entre incidentes de curta duração e gargalos sistêmicos de rede, banco ou disco.

3. **PILAR III: ENGENHARIA DE TRIGGERS & CALIBRAÇÃO ZABBIX 7.0**
   - Parecer técnico sobre os gatilhos mais frequentes ("${kpis.triggerMaisFrequente?.trigger || (kpis as any).incidenteMaisFrequente?.incidente || 'Triggers principais'}").
   - Sintaxe recomendada para eliminação de flapping, especificando:
     * Função Zabbix 7.0 adequada (substituição de \`last()\` instantâneo por agregação temporal \`min()\` ou \`avg()\`);
     * Par de Histerese (Problem Expression vs Recovery Expression) para estabilização definitiva.

4. **PILAR IV: ROADMAP INTEGRADO DE AÇÕES ESTRATÉGICAS**
   - **Imediato (0-7 dias):** 2 ações de quick win no Zabbix frontend para supressão imediata de alarmes falsos;
   - **Curto Prazo (8-30 dias):** Calibração de templates e definição de dependências lógicas;
   - **Médio Prazo (30-90 dias):** Governança de observabilidade, tags padronizadas e automação de remediação.

Adote tom corporativo, seguro, fundamentado estritamente nas métricas reais acima, sem especulações genéricas.`;
}

/**
 * Exporta a tabela filtrada para CSV compatível com Excel no padrão pt-BR (separador ponto e vírgula).
 */
export function exportToCSV(events: ZabbixEvent[], filename: string = 'relatorio_zabbix_filtrado.csv') {
  const headers = [
    'Severidade',
    'Hora',
    'Hora da recuperação',
    'Status',
    'Host',
    'Incidente',
    'Duração',
    'Duração (segundos)',
    'Reconhecido',
    'Ações',
    'Etiquetas',
  ];

  const escapeCSV = (val: unknown) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = events.map((e) => [
    escapeCSV(e.severidade),
    escapeCSV(e.hora),
    escapeCSV(e.horaRecuperacao || '-'),
    escapeCSV(e.status),
    escapeCSV(e.host),
    escapeCSV(e.incidente),
    escapeCSV(e.duracaoTexto),
    escapeCSV(e.duracaoSegundos),
    escapeCSV(e.reconhecido),
    escapeCSV(e.acoes || '-'),
    escapeCSV(e.etiquetasTexto || '-'),
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ReportPeriodInfo {
  mesAno: string;
  isoAnoMes: string;
  periodoDescricao: string;
  isFiltered: boolean;
}

/**
 * Extrai rigorosamente o período e mês/ano (recorte) do relatório com base nos filtros ativos
 * ou no intervalo real dos eventos filtrados, garantindo que o relatório acompanhe o filtro do usuário.
 */
export function getReportPeriodInfo(
  filters?: Partial<ZabbixFilters>,
  events: ZabbixEvent[] = []
): ReportPeriodInfo {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();

  const parseFilterDate = (str?: string) => {
    if (!str || typeof str !== 'string') return null;
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return null;
    return {
      year: parseInt(m[1], 10),
      month: parseInt(m[2], 10), // 1-12
      day: parseInt(m[3], 10),
      rawStr: str,
    };
  };

  const fromParts = parseFilterDate(filters?.dateFrom);
  const toParts = parseFilterDate(filters?.dateTo);

  let mesAno = '';
  let isoAnoMes = '';
  let periodoDescricao = '';
  let isFiltered = false;

  if (fromParts && toParts) {
    isFiltered = true;
    if (fromParts.year === toParts.year && fromParts.month === toParts.month) {
      // Ex: 09/2026
      mesAno = `${pad(fromParts.month)}/${fromParts.year}`;
      isoAnoMes = `${fromParts.year}-${pad(fromParts.month)}`;
      periodoDescricao = `${pad(fromParts.day)}/${pad(fromParts.month)}/${fromParts.year} a ${pad(toParts.day)}/${pad(toParts.month)}/${toParts.year}`;
    } else {
      // Ex: 08/2026 – 09/2026
      mesAno = `${pad(fromParts.month)}/${fromParts.year} – ${pad(toParts.month)}/${toParts.year}`;
      isoAnoMes = `${fromParts.year}-${pad(fromParts.month)}_${toParts.year}-${pad(toParts.month)}`;
      periodoDescricao = `${pad(fromParts.day)}/${pad(fromParts.month)}/${fromParts.year} a ${pad(toParts.day)}/${pad(toParts.month)}/${toParts.year}`;
    }
  } else if (fromParts) {
    isFiltered = true;
    mesAno = `${pad(fromParts.month)}/${fromParts.year}`;
    isoAnoMes = `${fromParts.year}-${pad(fromParts.month)}`;
    periodoDescricao = `A partir de ${pad(fromParts.day)}/${pad(fromParts.month)}/${fromParts.year}`;
  } else if (toParts) {
    isFiltered = true;
    mesAno = `${pad(toParts.month)}/${toParts.year}`;
    isoAnoMes = `${toParts.year}-${pad(toParts.month)}`;
    periodoDescricao = `Até ${pad(toParts.day)}/${pad(toParts.month)}/${toParts.year}`;
  } else {
    // Se não há filtro explícito de data, busca o intervalo real dos eventos fornecidos
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    for (const e of events) {
      if (e.dataInicio) {
        if (!minDate || e.dataInicio < minDate) minDate = e.dataInicio;
        if (!maxDate || e.dataInicio > maxDate) maxDate = e.dataInicio;
      }
    }

    if (minDate && maxDate) {
      const minM = minDate.getMonth() + 1;
      const minY = minDate.getFullYear();
      const maxM = maxDate.getMonth() + 1;
      const maxY = maxDate.getFullYear();

      if (minY === maxY && minM === maxM) {
        mesAno = `${pad(minM)}/${minY}`;
        isoAnoMes = `${minY}-${pad(minM)}`;
      } else {
        mesAno = `${pad(minM)}/${minY} – ${pad(maxM)}/${maxY}`;
        isoAnoMes = `${minY}-${pad(minM)}_${maxY}-${pad(maxM)}`;
      }
      periodoDescricao = `${pad(minDate.getDate())}/${pad(minM)}/${minY} a ${pad(maxDate.getDate())}/${pad(maxM)}/${maxY}`;
    } else {
      mesAno = `${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
      isoAnoMes = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      periodoDescricao = mesAno;
    }
  }

  return { mesAno, isoAnoMes, periodoDescricao, isFiltered };
}

export interface OptimizedTriggerEngineeringItem {
  triggerName: string;
  hostName: string;
  hostCount: number;
  count: number;
  avgDurationSec: number;
  severity: string;
  originalExpression?: string;
  problemExpression: string;
  problemExplanation: string;
  recoveryExpression: string;
  recoveryExplanation: string;
  technicalRootCause: string;
}

/**
 * Deriva dinamicamente a Engenharia de Expressões Otimizadas e Histerese (Zabbix 6.x/7.x)
 * a partir dos top incidentes e das expressões reais (coluna Expressão da planilha de 15 colunas).
 */
export function deriveOptimizedTriggerEngineering(
  topTriggers: [string, { count: number; totalDur: number; sev: string; hosts: Set<string> }][],
  events: ZabbixEvent[],
  maxItems: number = 3
): OptimizedTriggerEngineeringItem[] {
  const result: OptimizedTriggerEngineeringItem[] = [];

  for (const [triggerName, meta] of topTriggers.slice(0, maxItems)) {
    // Localiza os eventos desse gatilho para capturar a expressão real e o host real
    const matchedEvents = events.filter((e) => e.incidente === triggerName);
    const eventWithExpr = matchedEvents.find((e) => e.expressao && e.expressao.trim() !== '') || matchedEvents[0];
    const hostName = eventWithExpr?.host || Array.from(meta.hosts)[0] || 'host-corporativo';
    const originalExpr = eventWithExpr?.expressao?.trim();
    const avgSec = meta.count > 0 ? Math.round(meta.totalDur / meta.count) : 0;

    let problemExpression = '';
    let problemExplanation = '';
    let recoveryExpression = '';
    let recoveryExplanation = '';
    let technicalRootCause = '';

    if (avgSec < 300) {
      technicalRootCause = `Oscilação instantânea com duração média de ${formatDuration(avgSec)}. O alarme encerra antes da equipe atuar, indicando falta de histerese e sensibilidade excessiva a coletas isoladas.`;
    } else {
      technicalRootCause = `Tempo médio de resolução em ${formatDuration(avgSec)}. Concentração em ${meta.hosts.size} host(s) requer amortecimento temporal para evitar flapping prolongado.`;
    }

    // 1. Caso o usuário tenha a coluna Expressão preenchida na planilha
    if (originalExpr) {
      // Caso 1.1: Expressão com nodata(...)
      // Ex: nodata(/"servidor"/oracle.uptime,5m)=1 ou nodata(/host/item, 3m)=1
      const nodataMatch = originalExpr.match(/nodata\(\s*([^,)]+)\s*(?:,\s*([^)]+))?\s*\)(?:\s*=\s*1)?/i);
      if (nodataMatch) {
        const itemTarget = nodataMatch[1].trim();
        problemExpression = `nodata(${itemTarget}, 10m) = 1`;
        problemExplanation = 'PROBLEM EXPRESSION (ATIVAÇÃO APÓS 10M DE FALHA CONTÍNUA): Elimina timeouts e falhas esporádicas de conexão';
        recoveryExpression = `nodata(${itemTarget}, 5m) = 0`;
        recoveryExplanation = 'RECOVERY EXPRESSION (ENCERRAMENTO APÓS 5M DE ESTABILIDADE): Encerramento confirmado somente após 5 minutos de telemetria contínua';
      }
      // Caso 1.2: Expressão com last(...) ou {host:item.last()}
      else if (/last\(/i.test(originalExpr) || /\.last\(/i.test(originalExpr)) {
        if (/=\s*0/.test(originalExpr)) {
          const itemTarget = originalExpr.replace(/^last\(/i, '').replace(/\)\s*=\s*0.*$/, '').trim() || `/${hostName}/service.status`;
          problemExpression = `max(${itemTarget}, 10m) = 0`;
          problemExplanation = 'PROBLEM EXPRESSION (SERVIÇO DOWN SUSTENTADO POR 10M): Suprime reinicializações e reciclagens normais de processos';
          recoveryExpression = `min(${itemTarget}, 5m) > 0`;
          recoveryExplanation = 'RECOVERY EXPRESSION (RETORNO DE SAÚDE POR 5M): Confirma recuperação estável da porta ou serviço';
        } else if (/>=?\s*(\d+)/.test(originalExpr)) {
          const m = originalExpr.match(/>=?\s*(\d+)/);
          const threshold = m ? parseInt(m[1], 10) : 80;
          const recThreshold = Math.max(1, Math.round(threshold * 0.85));
          const itemTarget = originalExpr.replace(/^last\(/i, '').replace(/\)\s*>=?.*$/, '').trim() || `/${hostName}/metric.util`;
          problemExpression = `min(${itemTarget}, 10m) > ${threshold}`;
          problemExplanation = `PROBLEM EXPRESSION (MÍNIMO SUSTENTADO > ${threshold}% POR 10M): Evita picos instantâneos isolados`;
          recoveryExpression = `max(${itemTarget}, 5m) < ${recThreshold}`;
          recoveryExplanation = `RECOVERY EXPRESSION (RECUPERAÇÃO PÓS-HISTERESE < ${recThreshold}% POR 5M): Encerra com banda morta de amortecimento`;
        } else {
          problemExpression = originalExpr.replace(/last\(/gi, 'min(').replace(/\)/g, ', 10m)');
          problemExplanation = 'PROBLEM EXPRESSION: Amortecimento temporal de 10 minutos para validação de persistência';
          recoveryExpression = originalExpr.replace(/last\(/gi, 'max(').replace(/\)/g, ', 5m)').replace(/>/g, '<');
          recoveryExplanation = 'RECOVERY EXPRESSION: Critério de estabilização pós-incidente por 5 minutos';
        }
      }
      // Caso 1.3: Expressão já contém min/avg/max ou outra função Zabbix
      else {
        problemExpression = originalExpr;
        problemExplanation = 'PROBLEM EXPRESSION: Expressão mapeada diretamente da planilha de 15 colunas do cliente';
        recoveryExpression = `nodata(/${hostName}/agent.ping, 5m) = 0`;
        recoveryExplanation = 'RECOVERY EXPRESSION: Critério complementar de retorno à normalidade';
      }
    } else {
      // 2. Caso a planilha não possua a coluna Expressão preenchida para esse incidente específico:
      // Deriva automaticamente usando o HOST REAL e o nome do incidente real do cliente
      const lower = triggerName.toLowerCase();

      if (lower.includes('oracle') || lower.includes('banco') || lower.includes('database') || lower.includes('coletar dados') || lower.includes('redo')) {
        problemExpression = `nodata(/${hostName}/oracle.uptime, 10m) = 1`;
        problemExplanation = 'PROBLEM EXPRESSION (ATIVAÇÃO APÓS 10M DE FALHA CONTÍNUA): Elimina micro-timeouts momentâneos de conexão ODBC/poller';
        recoveryExpression = `nodata(/${hostName}/oracle.uptime, 5m) = 0`;
        recoveryExplanation = 'RECOVERY EXPRESSION (ENCERRAMENTO APÓS 5M DE ESTABILIDADE): Encerra o incidente após 5 minutos comprovados de coleta estável';
      } else if (lower.includes('heap') || lower.includes('memory') || lower.includes('memória') || lower.includes('portlet') || lower.includes('ram')) {
        problemExpression = `min(/${hostName}/vm.memory.util, 10m) > 80`;
        problemExplanation = 'PROBLEM EXPRESSION (MÍNIMO SUSTENTADO > 80% POR 10M): Aguarda atuação do Garbage Collector (GC) da JVM antes de alertar';
        recoveryExpression = `max(/${hostName}/vm.memory.util, 5m) < 70`;
        recoveryExplanation = 'RECOVERY EXPRESSION (RECUPERAÇÃO PÓS-GC < 70% POR 5M): Fecha o incidente com folga de histerese (banda morta de 10%)';
      } else if (lower.includes('ping') || lower.includes('icmp') || lower.includes('response time') || lower.includes('latência') || lower.includes('unreachable')) {
        problemExpression = `min(/${hostName}/icmpping, 5m) = 0`;
        problemExplanation = 'PROBLEM EXPRESSION (QUEDA CONFIRMADA POR 5M): Filtra perda pontual de pacotes em roteadores intermediários';
        recoveryExpression = `min(/${hostName}/icmpping, 3m) = 1`;
        recoveryExplanation = 'RECOVERY EXPRESSION (RESPOSTA CONTÍNUA POR 3M): Confirma retorno estável da rota antes de normalizar';
      } else if (lower.includes('cpu') || lower.includes('process') || lower.includes('load')) {
        problemExpression = `min(/${hostName}/system.cpu.util, 10m) > 85`;
        problemExplanation = 'PROBLEM EXPRESSION (CARGA ALTA SUSTENTADA POR 10M): Ignora crons, backups e picos momentâneos de execução';
        recoveryExpression = `max(/${hostName}/system.cpu.util, 5m) < 70`;
        recoveryExplanation = 'RECOVERY EXPRESSION (ESTABILIZAÇÃO < 70% POR 5M): Exige normalização consistente da fila de processamento';
      } else if (lower.includes('disk') || lower.includes('disco') || lower.includes('space') || lower.includes('fs')) {
        problemExpression = `last(/${hostName}/vfs.fs.size[/,pused]) > 90 and min(/${hostName}/vfs.fs.size[/,pused], 1h) > 88`;
        problemExplanation = 'PROBLEM EXPRESSION (CONSUMO CRÍTICO SUSTENTADO): Confirma saturação real sem falsos alarmes de arquivos temporários';
        recoveryExpression = `max(/${hostName}/vfs.fs.size[/,pused], 10m) < 85`;
        recoveryExplanation = 'RECOVERY EXPRESSION (LIBERAÇÃO EFETIVA DE ESPAÇO): Normaliza após limpeza ou expansão de volume confirmada';
      } else {
        problemExpression = `min(/${hostName}/service.status, 5m) = 0`;
        problemExplanation = 'PROBLEM EXPRESSION (INDISPONIBILIDADE POR 5M): Garante persistência da falha antes de notificar operadores';
        recoveryExpression = `min(/${hostName}/service.status, 3m) = 1`;
        recoveryExplanation = 'RECOVERY EXPRESSION (RETORNO DE SAÚDE POR 3M): Previne abertura e fechamento cíclico (flapping)';
      }
    }

    result.push({
      triggerName,
      hostName,
      hostCount: meta.hosts.size,
      count: meta.count,
      avgDurationSec: avgSec,
      severity: meta.sev,
      originalExpression: originalExpr,
      problemExpression,
      problemExplanation,
      recoveryExpression,
      recoveryExplanation,
      technicalRootCause,
    });
  }

  return result;
}

/**
 * Computa métricas comparativas entre o período atual e o período comparativo selecionado
 */
export function computeComparativeMetrics(
  rawEvents: ZabbixEvent[],
  activeFilters: ZabbixFilters
): ComparativeMetricsResult | null {
  if (!activeFilters.comparisonEnabled) return null;

  let compFrom: Date | null = null;
  let compTo: Date | null = null;
  let label = 'Período Comparativo';

  if (activeFilters.comparisonPreset === 'previous_month') {
    const baseDate = activeFilters.dateFrom ? new Date(activeFilters.dateFrom) : new Date();
    compFrom = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1, 0, 0, 0);
    compTo = new Date(baseDate.getFullYear(), baseDate.getMonth(), 0, 23, 59, 59);
    label = `Mês Anterior (${compFrom.toLocaleDateString('pt-BR')} a ${compTo.toLocaleDateString('pt-BR')})`;
  } else if (activeFilters.comparisonPreset === 'previous_period' && activeFilters.dateFrom && activeFilters.dateTo) {
    const curFrom = new Date(activeFilters.dateFrom).getTime();
    const curTo = new Date(activeFilters.dateTo).getTime();
    const durationMs = curTo - curFrom;
    compTo = new Date(curFrom - 1000);
    compFrom = new Date(curFrom - durationMs);
    label = `Período Homólogo (${compFrom.toLocaleDateString('pt-BR')} a ${compTo.toLocaleDateString('pt-BR')})`;
  } else if (activeFilters.comparisonDateFrom && activeFilters.comparisonDateTo) {
    compFrom = new Date(activeFilters.comparisonDateFrom);
    compTo = new Date(activeFilters.comparisonDateTo);
    label = `Custom (${compFrom.toLocaleDateString('pt-BR')} a ${compTo.toLocaleDateString('pt-BR')})`;
  } else {
    return null;
  }

  // Eventos do período atual
  const baselineEvents = filterEvents(rawEvents, activeFilters);
  const baselineKpis = computeKPIs(baselineEvents);

  // Filtra eventos comparativos aplicando os mesmos filtros de host/severidade/trigger/tag, mas com as datas comparativas
  const compFilters: ZabbixFilters = {
    ...activeFilters,
    dateFrom: compFrom.toISOString().slice(0, 16),
    dateTo: compTo.toISOString().slice(0, 16),
    comparisonEnabled: false,
  };
  const compEvents = filterEvents(rawEvents, compFilters);
  const comparisonKpis = computeKPIs(compEvents);

  const mttrDeltaSeconds = baselineKpis.mttrSegundos - comparisonKpis.mttrSegundos;
  const mttrDeltaPct = comparisonKpis.mttrSegundos > 0
    ? Math.round(((baselineKpis.mttrSegundos - comparisonKpis.mttrSegundos) / comparisonKpis.mttrSegundos) * 100)
    : 0;

  const mtbfDeltaSeconds = baselineKpis.mtbfSegundosGlobal - comparisonKpis.mtbfSegundosGlobal;
  const mtbfDeltaPct = comparisonKpis.mtbfSegundosGlobal > 0
    ? Math.round(((baselineKpis.mtbfSegundosGlobal - comparisonKpis.mtbfSegundosGlobal) / comparisonKpis.mtbfSegundosGlobal) * 100)
    : 0;

  const volumeDeltaCount = baselineKpis.totalEventos - comparisonKpis.totalEventos;
  const volumeDeltaPct = comparisonKpis.totalEventos > 0
    ? Math.round(((baselineKpis.totalEventos - comparisonKpis.totalEventos) / comparisonKpis.totalEventos) * 100)
    : 0;

  const noiseDeltaCount = baselineKpis.totalRuidoOperacional - comparisonKpis.totalRuidoOperacional;
  const noiseDeltaPct = comparisonKpis.totalRuidoOperacional > 0
    ? Math.round(((baselineKpis.totalRuidoOperacional - comparisonKpis.totalRuidoOperacional) / comparisonKpis.totalRuidoOperacional) * 100)
    : 0;

  return {
    hasComparison: true,
    baselineKpis,
    comparisonKpis,
    comparisonPeriodLabel: label,
    mttrDeltaSeconds,
    mttrDeltaPct,
    mtbfDeltaSeconds,
    mtbfDeltaPct,
    volumeDeltaCount,
    volumeDeltaPct,
    noiseDeltaCount,
    noiseDeltaPct,
  };
}

