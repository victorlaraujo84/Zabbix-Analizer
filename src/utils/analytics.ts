import { ZabbixEvent, ZabbixFilters, ZabbixKPIs } from '../types/zabbix';
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
    if (filters.hosts.length > 0 && !filters.hosts.includes(evt.host)) {
      return false;
    }

    // 4. Filtro de Trigger (Incidente)
    if (filters.triggers.length > 0 && !filters.triggers.includes(evt.incidente)) {
      return false;
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

    return true;
  });
}

/**
 * Calcula os indicadores chave de desempenho (KPIs) com MTTR, MTBF e Taxa de Atuação.
 */
export function computeKPIs(events: ZabbixEvent[]): ZabbixKPIs {
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
    };
  }

  let totalAbertos = 0;
  let duracaoTotalSegundos = 0;
  let duracaoResolvidosSegundos = 0;
  let totalResolvidos = 0;
  let totalReconhecidos = 0;
  let totalRuidoOperacional = 0;

  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  const hostCounts = new Map<string, { count: number; duracaoSegundos: number }>();
  const triggerCounts = new Map<string, number>();

  for (const evt of events) {
    duracaoTotalSegundos += evt.duracaoSegundos;

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

    if (evt.dataInicio) {
      if (!minDate || evt.dataInicio < minDate) minDate = evt.dataInicio;
      if (!maxDate || evt.dataInicio > maxDate) maxDate = evt.dataInicio;
    }

    // Contagem por host
    const hData = hostCounts.get(evt.host) || { count: 0, duracaoSegundos: 0 };
    hData.count++;
    hData.duracaoSegundos += evt.duracaoSegundos;
    hostCounts.set(evt.host, hData);

    // Contagem por trigger
    triggerCounts.set(evt.incidente, (triggerCounts.get(evt.incidente) || 0) + 1);
  }

  // Host mais afetado
  let topHost = 'Nenhum';
  let topHostCount = 0;
  let topHostDuracao = 0;
  for (const [h, data] of hostCounts.entries()) {
    if (data.count > topHostCount) {
      topHostCount = data.count;
      topHost = h;
      topHostDuracao = data.duracaoSegundos;
    }
  }

  // Trigger mais frequente
  let topTrigger = 'Nenhuma';
  let topTriggerCount = 0;
  for (const [t, count] of triggerCounts.entries()) {
    if (count > topTriggerCount) {
      topTriggerCount = count;
      topTrigger = t;
    }
  }

  const duracaoMediaSegundos = Math.round(duracaoTotalSegundos / totalEventos);
  const mttrSegundos = totalResolvidos > 0 ? Math.round(duracaoResolvidosSegundos / totalResolvidos) : 0;
  const taxaAtuacaoPercentual = Math.round((totalReconhecidos / totalEventos) * 100);

  // Janela total observada para cálculo de MTBF
  let windowSeconds = 0;
  if (minDate && maxDate) {
    windowSeconds = Math.max(1, Math.floor((maxDate.getTime() - minDate.getTime()) / 1000));
  } else {
    windowSeconds = duracaoTotalSegundos * 2;
  }

  // MTBF Global
  const uptimeGlobalSeconds = Math.max(0, windowSeconds - duracaoTotalSegundos);
  const mtbfSegundosGlobal = totalEventos > 0 ? Math.round(uptimeGlobalSeconds / totalEventos) : 0;

  // MTBF Host Crítico
  const uptimeHostSeconds = Math.max(0, windowSeconds - topHostDuracao);
  const mtbfSegundosHostCritico = topHostCount > 0 ? Math.round(uptimeHostSeconds / topHostCount) : 0;

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
    const valStr = filters.tagValues.length > 0 ? filters.tagValues.join(', ') : 'Qualquer valor';
    lines.push(`- **Etiquetas (Tags):** Chave "${filters.tagKey}" = [${valStr}]`);
  } else {
    lines.push('- **Etiquetas (Tags):** Sem restrição de tags');
  }

  // Busca textual
  if (filters.searchQuery.trim()) {
    lines.push(`- **Busca Textual Ativa:** "${filters.searchQuery.trim()}"`);
  }

  // Proporção do Escopo
  lines.push(`- **Amostra Analisada:** **${filteredTotal} de ${rawTotal} eventos** (${rawTotal > 0 ? Math.round((filteredTotal / rawTotal) * 100) : 0}% do dataset completo)`);

  return lines.join('\n');
}

/**
 * Gera Prompt estruturado para IA sugerir ajustes e tuning em triggers Zabbix
 * rigorosamente alinhado com o que está filtrado/selecionado pelo usuário.
 */
export function generateTriggerTuningPrompt(
  events: ZabbixEvent[],
  kpis: ZabbixKPIs,
  filters: ZabbixFilters,
  rawTotal: number
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
      return `- **Trigger**: "${trigger}"\n  - Ocorrências no escopo: ${data.count} vezes\n  - Duração média da falha: ${formatDuration(avgSec)}\n  - Hosts impactados (${data.hosts.size}): ${Array.from(data.hosts).slice(0, 3).join(', ')}${data.hosts.size > 3 ? '...' : ''}\n  - Severidades: ${Array.from(data.severities).join(', ')}`;
    });

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

---

### TOP TRIGGERS COM COMPORTAMENTO DE RUÍDO / FLAPPING NO ESCOPO:
${topNoise.length > 0 ? topNoise.join('\n\n') : 'Nenhuma trigger de curta duração encontrada com os filtros atuais.'}

---

### SUAS TAREFAS COMO ESPECIALISTA ZABBIX:
1. **Diagnóstico dos Alarmes Filtrados**:
   - Analise especificamente as triggers e hosts identificados no escopo acima.
   - Explique a causa física/lógica provável para a oscilação desses itens sob a perspectiva do escopo filtrado.
2. **Engenharia de Expressões Zabbix Otimizadas (Zabbix 6.x/7.x)**:
   - Forneça a sintaxe exata para cada trigger problemática.
   - Substitua chamadas sensíveis \`last()\` por funções de agregação temporal: \`min(/host/item, 5m)\`, \`avg(/host/item, 10m)\`, ou \`count(/host/item, 5m,"gt",90) >= 3\`.
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
- **MTBF (Mean Time Between Failures):** ${formatDuration(kpis.mtbfSegundosGlobal)}
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
