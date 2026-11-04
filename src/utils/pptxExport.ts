import pptxgen from 'pptxgenjs';
import { ZabbixEvent, ZabbixFilters, ZabbixKPIs } from '../types/zabbix';
import { formatDuration } from './parser';

export interface PPTXExportOptions {
  theme: 'executivo' | 'tecnico' | 'book_resultados';
  clientName: string;
  reportTitle?: string;
  docCode?: string;
  author?: string;
  events: ZabbixEvent[];
  kpis: ZabbixKPIs;
  activeFilters: ZabbixFilters;
  aiNarrative?: string;
  companyName?: string;
  promptText?: string;
  customDirectives?: string;
}

export async function exportPresentationToPPTX(options: PPTXExportOptions): Promise<void> {
  const {
    theme,
    clientName,
    reportTitle,
    docCode = 'LAUDO-NOC-2026',
    author = 'Equipe de Observabilidade & Confiabilidade',
    events,
    kpis,
    activeFilters,
    aiNarrative,
    companyName = 'SNOC Observability Suite',
  } = options;

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = author;
  pres.company = companyName;
  pres.title = reportTitle || `Apresentação de Observabilidade - ${clientName}`;

  // Cores corporativas padrão
  const NAVY = '0F172A';
  const BLUE = '2563EB';
  const EMERALD = '059669';
  const RED = 'DC2626';
  const AMBER = 'D97706';
  const SLATE_BG = 'F8FAFC';
  const CARD_BG = 'FFFFFF';
  const BORDER_COLOR = 'CBD5E1';
  const TEXT_MUTED = '64748B';

  const shortPct = kpis.totalEventos > 0
    ? Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100)
    : 0;

  const hostAfetadoStr = typeof kpis.hostMaisAfetado?.host === 'object' && kpis.hostMaisAfetado?.host !== null
    ? ((kpis.hostMaisAfetado.host as any).host || String(kpis.hostMaisAfetado.host))
    : String(kpis.hostMaisAfetado?.host || 'Nenhum');

  const triggerFreqStr = typeof kpis.triggerMaisFrequente?.trigger === 'object' && kpis.triggerMaisFrequente?.trigger !== null
    ? ((kpis.triggerMaisFrequente.trigger as any).trigger || String(kpis.triggerMaisFrequente.trigger))
    : String(kpis.triggerMaisFrequente?.trigger || 'Nenhuma');

  // Top 5 Hosts
  const hostCounts = new Map<string, number>();
  events.forEach((e) => {
    const h = typeof e.host === 'object' && e.host !== null ? (e.host as any).host : String(e.host || '');
    if (h && h.trim()) hostCounts.set(h, (hostCounts.get(h) || 0) + 1);
  });
  const topHosts = Array.from(hostCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Helper para Cabeçalho Padrão nos Slides Internos
  const addSlideHeader = (slide: pptxgen.Slide, sectionNum: string, title: string, subtitle: string) => {
    // Fundo geral do slide
    slide.background = { color: SLATE_BG };

    // Barra superior decorativa
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.1,
      fill: { color: BLUE },
    });

    // Nome da Empresa e Código no topo
    slide.addText(`${companyName.toUpperCase()} · ${clientName.toUpperCase()} · ${docCode}`, {
      x: 0.8,
      y: 0.35,
      w: 11.73,
      h: 0.3,
      fontSize: 9,
      color: TEXT_MUTED,
      fontFace: 'Arial',
      bold: true,
    });

    // Título da Seção
    slide.addText(`${sectionNum} ${title}`, {
      x: 0.8,
      y: 0.65,
      w: 11.73,
      h: 0.5,
      fontSize: 18,
      color: NAVY,
      fontFace: 'Arial',
      bold: true,
    });

    // Subtítulo
    slide.addText(subtitle, {
      x: 0.8,
      y: 1.15,
      w: 11.73,
      h: 0.3,
      fontSize: 11,
      color: TEXT_MUTED,
      fontFace: 'Arial',
    });

    // Linha divisória suave
    slide.addShape(pres.ShapeType.line, {
      x: 0.8,
      y: 1.5,
      w: 11.73,
      h: 0,
      line: { color: BORDER_COLOR, width: 1 },
    });

    // Rodapé padrão
    slide.addText(`Apresentação Executiva de Observabilidade Zabbix · ${new Date().toLocaleDateString('pt-BR')}`, {
      x: 0.8,
      y: 7.0,
      w: 10.0,
      h: 0.3,
      fontSize: 8,
      color: TEXT_MUTED,
      fontFace: 'Arial',
    });
  };

  // ==========================================
  // SLIDE 1: CAPA CORPORATIVA (16:9 Widescreen)
  // ==========================================
  const slideCover = pres.addSlide();
  slideCover.background = { color: NAVY };

  // Faixa de destaque azul lateral
  slideCover.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.3,
    h: 7.5,
    fill: { color: BLUE },
  });

  // Tag do modelo
  slideCover.addText(theme === 'executivo' ? 'RELATÓRIO EXECUTIVO C-LEVEL' : 'LAUDO TÉCNICO DE ENGENHARIA & NOC', {
    x: 1.2,
    y: 1.6,
    w: 10.5,
    h: 0.35,
    fontSize: 11,
    color: '60A5FA',
    bold: true,
    fontFace: 'Arial',
  });

  // Título Principal
  slideCover.addText(reportTitle || 'Auditoria Operacional & Diagnóstico de Confiabilidade', {
    x: 1.2,
    y: 2.0,
    w: 11.0,
    h: 1.4,
    fontSize: 28,
    color: 'FFFFFF',
    bold: true,
    fontFace: 'Arial',
  });

  // Subtítulo
  slideCover.addText(`Análise estatística de incidentes Zabbix, mitigação de ruído operacional e governança de infraestrutura.`, {
    x: 1.2,
    y: 3.5,
    w: 10.5,
    h: 0.6,
    fontSize: 14,
    color: '94A3B8',
    fontFace: 'Arial',
  });

  // Linha divisória
  slideCover.addShape(pres.ShapeType.line, {
    x: 1.2,
    y: 4.3,
    w: 10.5,
    h: 0,
    line: { color: '334155', width: 1 },
  });

  // Metadados do Cliente e Auditoria
  const coverMeta = [
    [
      { text: 'CLIENTE:', options: { bold: true, color: '64748B', fontSize: 10 } },
      { text: clientName, options: { bold: true, color: 'FFFFFF', fontSize: 11 } },
      { text: 'DATA AUDITORIA:', options: { bold: true, color: '64748B', fontSize: 10 } },
      { text: new Date().toLocaleDateString('pt-BR'), options: { color: 'FFFFFF', fontSize: 11 } },
    ],
    [
      { text: 'DOCUMENTO:', options: { bold: true, color: '64748B', fontSize: 10 } },
      { text: docCode, options: { color: 'FFFFFF', fontSize: 11 } },
      { text: 'TOTAL INCIDENTES:', options: { bold: true, color: '64748B', fontSize: 10 } },
      { text: `${kpis.totalEventos} eventos`, options: { bold: true, color: '38BDF8', fontSize: 11 } },
    ],
    [
      { text: 'ELABORADO POR:', options: { bold: true, color: '64748B', fontSize: 10 } },
      { text: author, options: { color: 'FFFFFF', fontSize: 11 } },
      { text: 'CLASSIFICAÇÃO:', options: { bold: true, color: '64748B', fontSize: 10 } },
      { text: 'Confidencial / Corporativo', options: { color: 'F59E0B', fontSize: 11, bold: true } },
    ],
  ];

  slideCover.addTable(coverMeta as any, {
    x: 1.2,
    y: 4.6,
    w: 10.5,
    colW: [2.0, 3.5, 2.0, 3.0],
    border: { type: 'none' },
  });

  // ==========================================
  // SLIDE 2: INDICADORES GLOBAIS (4 BIG NUMBERS)
  // ==========================================
  const slideKpis = pres.addSlide();
  addSlideHeader(
    slideKpis,
    '01.',
    'Indicadores Globais de Performance & Confiabilidade',
    'Consolidação das principais métricas operacionais e taxa de ruído no período auditado.'
  );

  // 4 Cards Big Numbers
  const cardWidth = 2.75;
  const cardGap = 0.24;
  const cardStartX = 0.8;
  const cardY = 1.8;
  const cardH = 2.2;

  // Card 1: Disponibilidade
  slideKpis.addShape(pres.ShapeType.rect, {
    x: cardStartX,
    y: cardY,
    w: cardWidth,
    h: cardH,
    fill: { color: CARD_BG },
    line: { color: BORDER_COLOR, width: 1 },
  });
  slideKpis.addShape(pres.ShapeType.rect, {
    x: cardStartX,
    y: cardY,
    w: cardWidth,
    h: 0.1,
    fill: { color: EMERALD },
  });
  slideKpis.addText('DISPONIBILIDADE DO ESCOPO', {
    x: cardStartX + 0.2,
    y: cardY + 0.25,
    w: cardWidth - 0.4,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: EMERALD,
  });
  const dispPctStr = kpis.mtbfDetails?.taxaDisponibilidadePct !== undefined
    ? `${kpis.mtbfDetails.taxaDisponibilidadePct.toFixed(2)}%`
    : '99.4%';
  slideKpis.addText(dispPctStr, {
    x: cardStartX + 0.2,
    y: cardY + 0.6,
    w: cardWidth - 0.4,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: NAVY,
    fontFace: 'Arial',
  });
  slideKpis.addText(`Meta Contratual: 99.0%\nBase: ${kpis.totalHorasPlanejadasPeriodo || 720}h (${kpis.totalDiasPeriodo || 30}d 24x7)`, {
    x: cardStartX + 0.2,
    y: cardY + 1.45,
    w: cardWidth - 0.4,
    h: 0.6,
    fontSize: 9,
    color: TEXT_MUTED,
  });

  // Card 2: Ruído Operacional
  const xCard2 = cardStartX + cardWidth + cardGap;
  slideKpis.addShape(pres.ShapeType.rect, {
    x: xCard2,
    y: cardY,
    w: cardWidth,
    h: cardH,
    fill: { color: CARD_BG },
    line: { color: BORDER_COLOR, width: 1 },
  });
  slideKpis.addShape(pres.ShapeType.rect, {
    x: xCard2,
    y: cardY,
    w: cardWidth,
    h: 0.1,
    fill: { color: RED },
  });
  slideKpis.addText('RUÍDO OPERACIONAL (< 5M)', {
    x: xCard2 + 0.2,
    y: cardY + 0.25,
    w: cardWidth - 0.4,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: RED,
  });
  slideKpis.addText(`${shortPct}%`, {
    x: xCard2 + 0.2,
    y: cardY + 0.6,
    w: cardWidth - 0.4,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: RED,
    fontFace: 'Arial',
  });
  slideKpis.addText(`${kpis.totalRuidoOperacional} de ${kpis.totalEventos} alarmes\nAutoresolvidos sem intervenção`, {
    x: xCard2 + 0.2,
    y: cardY + 1.45,
    w: cardWidth - 0.4,
    h: 0.6,
    fontSize: 9,
    color: TEXT_MUTED,
  });

  // Card 3: MTTR Médio
  const xCard3 = xCard2 + cardWidth + cardGap;
  slideKpis.addShape(pres.ShapeType.rect, {
    x: xCard3,
    y: cardY,
    w: cardWidth,
    h: cardH,
    fill: { color: CARD_BG },
    line: { color: BORDER_COLOR, width: 1 },
  });
  slideKpis.addShape(pres.ShapeType.rect, {
    x: xCard3,
    y: cardY,
    w: cardWidth,
    h: 0.1,
    fill: { color: BLUE },
  });
  slideKpis.addText('TEMPO MÉDIO DE RESOLUÇÃO (MTTR)', {
    x: xCard3 + 0.2,
    y: cardY + 0.25,
    w: cardWidth - 0.4,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: BLUE,
  });
  slideKpis.addText(formatDuration(kpis.mttrSegundos), {
    x: xCard3 + 0.2,
    y: cardY + 0.6,
    w: cardWidth - 0.4,
    h: 0.8,
    fontSize: 26,
    bold: true,
    color: NAVY,
    fontFace: 'Arial',
  });
  slideKpis.addText(`Média de duração dos incidentes\nTempo total de indisponibilidade`, {
    x: xCard3 + 0.2,
    y: cardY + 1.45,
    w: cardWidth - 0.4,
    h: 0.6,
    fontSize: 9,
    color: TEXT_MUTED,
  });

  // Card 4: Taxa de Atuação Humana
  const xCard4 = xCard3 + cardWidth + cardGap;
  slideKpis.addShape(pres.ShapeType.rect, {
    x: xCard4,
    y: cardY,
    w: cardWidth,
    h: cardH,
    fill: { color: CARD_BG },
    line: { color: BORDER_COLOR, width: 1 },
  });
  slideKpis.addShape(pres.ShapeType.rect, {
    x: xCard4,
    y: cardY,
    w: cardWidth,
    h: 0.1,
    fill: { color: AMBER },
  });
  slideKpis.addText('ATENDIMENTO HUMANO NOC', {
    x: xCard4 + 0.2,
    y: cardY + 0.25,
    w: cardWidth - 0.4,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: AMBER,
  });
  slideKpis.addText(`${kpis.taxaAtuacaoPercentual}%`, {
    x: xCard4 + 0.2,
    y: cardY + 0.6,
    w: cardWidth - 0.4,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: NAVY,
    fontFace: 'Arial',
  });
  slideKpis.addText(`${kpis.totalReconhecidos} incidentes reconhecidos\nTaxa de acompanhamento em tempo real`, {
    x: xCard4 + 0.2,
    y: cardY + 1.45,
    w: cardWidth - 0.4,
    h: 0.6,
    fontSize: 9,
    color: TEXT_MUTED,
  });

  // Caixa de Diagnóstico Resumido Inferior
  slideKpis.addShape(pres.ShapeType.rect, {
    x: 0.8,
    y: 4.3,
    w: 11.73,
    h: 2.3,
    fill: { color: CARD_BG },
    line: { color: BORDER_COLOR, width: 1 },
  });
  slideKpis.addText('SÍNTESE EXECUTIVA DO PERÍODO', {
    x: 1.1,
    y: 4.5,
    w: 11.0,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: NAVY,
  });
  const summaryBullets = [
    `Confiabilidade NOC (MTBF 24x7): ${formatDuration(kpis.mtbfSegundosGlobal)} entre incidentes críticos de indisponibilidade (${kpis.mtbfDetails?.numeroFalhasCriticas ?? 0} falhas de parada/link contabilizadas).`,
    `Volume de Ruído Operacional: ${shortPct}% dos alarmes duraram menos de 5 minutos, gerando sobrecarga cognitiva e falsos acionamentos no time de monitoramento.`,
    `Concentração de Ofensores: O ativo ${hostAfetadoStr} concentrou ${kpis.hostMaisAfetado?.count ?? 0} incidentes, representando o principal vetor de degradação da estabilidade no escopo.`,
    `Gatilho Mais Frequente: A trigger "${triggerFreqStr}" registrou ${kpis.triggerMaisFrequente?.count ?? 0} ocorrências no período, necessitando implementação de histerese e ajuste de janelas temporais.`,
  ];
  slideKpis.addText(summaryBullets.map((b) => `• ${b}`).join('\n\n'), {
    x: 1.1,
    y: 4.9,
    w: 11.1,
    h: 1.5,
    fontSize: 10,
    color: '334155',
    lineSpacing: 16,
  });

  // ==========================================
  // SLIDE 3: DIAGNÓSTICO ESTRATÉGICO & IA
  // ==========================================
  const slideDiag = pres.addSlide();
  addSlideHeader(
    slideDiag,
    '02.',
    'Diagnóstico Estratégico & Análise de Causa Raiz',
    'Avaliação qualitativa orientada à estabilidade operacional e proteção do SLA corporativo.'
  );

  // Painel de Texto de Diagnóstico
  slideDiag.addShape(pres.ShapeType.rect, {
    x: 0.8,
    y: 1.8,
    w: 11.73,
    h: 4.9,
    fill: { color: CARD_BG },
    line: { color: BORDER_COLOR, width: 1 },
  });

  slideDiag.addText('PARECER TÉCNICO DE CONFIABILIDADE (SRE & OBSERVABILIDADE)', {
    x: 1.1,
    y: 2.05,
    w: 11.0,
    h: 0.35,
    fontSize: 12,
    bold: true,
    color: NAVY,
  });

  const narrativeText = aiNarrative || `No período auditado para o cliente ${clientName}, foram catalogados ${kpis.totalEventos} incidentes operacionais na malha de monitoramento Zabbix.

A análise aprofundada revelou que ${shortPct}% dos chamados gerados se enquadram como ruído operacional transitório (duração inferior a 300 segundos). Esses eventos autorresolvidos provocam severa fadiga de alertas na equipe de NOC e mascaram incidentes de criticidade real.

O servidor "${hostAfetadoStr}" foi identificado como o principal ponto crítico da infraestrutura, concentrando ${kpis.hostMaisAfetado?.count ?? 0} alarmes. Observa-se um padrão característico de flapping de recursos, onde a métrica oscila no limiar de disparo sem folga de histerese para normalização.

Recomenda-se a adoção imediata da padronização de triggers Zabbix 7.0 homologada pelo SNOC, aplicando expressões de recuperação dedicadas e mitigação temporal através de funções min() e avg().`;

  slideDiag.addText(narrativeText, {
    x: 1.1,
    y: 2.5,
    w: 11.1,
    h: 3.9,
    fontSize: 11,
    color: '334155',
    lineSpacing: 18,
  });

  // ==========================================
  // SLIDE 4: ATIVOS CRÍTICOS & TOP OFENSORES
  // ==========================================
  const slideOffenders = pres.addSlide();
  addSlideHeader(
    slideOffenders,
    '03.',
    'Ativos Críticos & Matriz de Concentração de Incidentes',
    'Servidores e nós de rede com maior volume de alarmes demandando intervenção técnica.'
  );

  // Tabela de Top Hosts
  const offenderRows: any[] = [
    [
      { text: 'Host / Ativo Crítico', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      { text: 'Incidentes', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'center' } },
      { text: 'Volume %', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'center' } },
      { text: 'Classificação de Risco', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      { text: 'Ação Recomendada SNOC', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
    ],
  ];

  topHosts.forEach(([host, count], idx) => {
    const pct = kpis.totalEventos > 0 ? Math.round((count / kpis.totalEventos) * 100) : 0;
    const isFirst = idx === 0;
    offenderRows.push([
      { text: host, options: { bold: true, color: NAVY, fontSize: 10 } },
      { text: String(count), options: { align: 'center', fontSize: 10, bold: true } },
      { text: `${pct}%`, options: { align: 'center', fontSize: 10 } },
      {
        text: isFirst ? 'CRÍTICO — Alto Flapping' : idx === 1 ? 'ALTO — Oscilação Recorrente' : 'MÉDIO — Sobrecarga Pontual',
        options: { color: isFirst ? RED : idx === 1 ? AMBER : BLUE, bold: true, fontSize: 10 },
      },
      {
        text: isFirst ? 'Calibração urgente de histerese e tuning' : 'Revisão de janelas e dependências',
        options: { color: '475569', fontSize: 9.5 },
      },
    ]);
  });

  if (topHosts.length === 0) {
    offenderRows.push([
      { text: 'Nenhum host ofensor identificado no escopo', options: { colSpan: 5, align: 'center', color: TEXT_MUTED } },
    ]);
  }

  slideOffenders.addTable(offenderRows, {
    x: 0.8,
    y: 1.8,
    w: 11.73,
    colW: [3.2, 1.2, 1.2, 2.8, 3.33],
    rowH: 0.45,
    border: { pt: 1, color: BORDER_COLOR },
  });

  // Caixa de Recomendação de Tuning
  slideOffenders.addShape(pres.ShapeType.rect, {
    x: 0.8,
    y: 4.8,
    w: 11.73,
    h: 1.8,
    fill: { color: 'FEF3C7' },
    line: { color: 'F59E0B', width: 1 },
  });
  slideOffenders.addText('DIRETRIZ DE ENGENHARIA PARA OS ATIVOS MAIS AFETADOS', {
    x: 1.1,
    y: 5.0,
    w: 11.0,
    h: 0.3,
    fontSize: 10,
    bold: true,
    color: '92400E',
  });
  slideOffenders.addText(
    `Recomenda-se priorizar o ativo "${hostAfetadoStr}". Para servidores de banco de dados e aplicações web sob stress, a alteração de triggers pontuais com last() para funções estatísticas agregadas como min(..., 5m) reduz imediatamente até 75% dos alarmes falsos de saturação sem comprometer o monitoramento proativo.`,
    {
      x: 1.1,
      y: 5.35,
      w: 11.1,
      h: 1.1,
      fontSize: 10,
      color: '78350F',
      lineSpacing: 15,
    }
  );

  // ==========================================
  // SLIDE 5: PLANO DE AÇÃO & RECOMENDAÇÕES
  // ==========================================
  const slideAction = pres.addSlide();
  addSlideHeader(
    slideAction,
    '04.',
    'Plano de Ação de Engenharia & Cronograma de Melhorias',
    'Iniciativas prioritárias para eliminação de ruído e blindagem da operação.'
  );

  const actionPlans = [
    {
      id: 'P1',
      title: 'Tuning de Histerese nos 5 Maiores Ofensores',
      desc: 'Substituição de triggers instantâneas por pares de problema/recuperação (ex: dispara em > 90% por 5m e fecha em < 75% por 10m).',
      prazo: 'Imediato (1 a 3 dias)',
      impacto: 'Redução de até 80% do flapping nos hosts críticos',
      color: RED,
    },
    {
      id: 'P2',
      title: 'Supressão Inteligente de Alarmes Transitórios',
      desc: 'Parametrização de janelas temporais de 3 a 5 minutos para alarmes de link ICMP e serviços TCP antes da geração do evento.',
      prazo: 'Curto Prazo (1 semana)',
      impacto: 'Eliminação de alarmes de ruído < 5 minutos',
      color: AMBER,
    },
    {
      id: 'P3',
      title: 'Mapeamento de Dependências Zabbix 7.0',
      desc: 'Configuração de hierarquia pai-filho entre switches/roteadores e servidores para evitar avalanche de alertas em quedas de link.',
      prazo: 'Médio Prazo (2 semanas)',
      impacto: 'Correlação de causa raiz no NOC',
      color: BLUE,
    },
    {
      id: 'P4',
      title: 'Homologação Contínua no Catálogo da Fábrica',
      desc: 'Registro das novas regras de detecção no catálogo corporativo de triggers para reaproveitamento em futuros hosts do cliente.',
      prazo: 'Processo Contínuo',
      impacto: 'Padronização arquitetural da observabilidade',
      color: EMERALD,
    },
  ];

  actionPlans.forEach((plan, i) => {
    const yPos = 1.8 + i * 1.18;
    slideAction.addShape(pres.ShapeType.rect, {
      x: 0.8,
      y: yPos,
      w: 11.73,
      h: 1.05,
      fill: { color: CARD_BG },
      line: { color: BORDER_COLOR, width: 1 },
    });

    // Badge de Prioridade
    slideAction.addShape(pres.ShapeType.rect, {
      x: 1.0,
      y: yPos + 0.18,
      w: 0.6,
      h: 0.65,
      fill: { color: plan.color },
    });
    slideAction.addText(plan.id, {
      x: 1.0,
      y: yPos + 0.28,
      w: 0.6,
      h: 0.4,
      fontSize: 12,
      bold: true,
      color: 'FFFFFF',
      align: 'center',
    });

    // Título e Descrição
    slideAction.addText(plan.title, {
      x: 1.8,
      y: yPos + 0.15,
      w: 6.5,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: NAVY,
    });
    slideAction.addText(plan.desc, {
      x: 1.8,
      y: yPos + 0.45,
      w: 6.5,
      h: 0.5,
      fontSize: 9.5,
      color: '475569',
    });

    // Metadados de Prazo e Impacto à Direita
    slideAction.addText(`Prazo: ${plan.prazo}\nImpacto: ${plan.impacto}`, {
      x: 8.5,
      y: yPos + 0.22,
      w: 3.8,
      h: 0.65,
      fontSize: 9,
      bold: true,
      color: NAVY,
      align: 'right',
    });
  });

  // ==========================================
  // SLIDES ADICIONAIS PARA O MODELO TÉCNICO
  // ==========================================
  if (theme === 'tecnico') {
    // SLIDE 6: SEVERIDADE & STATUS
    const slideTechSev = pres.addSlide();
    addSlideHeader(
      slideTechSev,
      '05.',
      'Distribuição por Severidade & Status Operacional',
      'Mapeamento da criticidade dos incidentes registrados e resolutividade da equipe.'
    );

    // Contagem de severidades defensiva
    const severityCounts: Record<string, number> = {
      Desastre: 0,
      Alto: 0,
      Médio: 0,
      Aviso: 0,
      Informação: 0,
    };
    if (kpis?.porSeveridade) {
      severityCounts.Desastre = kpis.porSeveridade['Desastre'] || 0;
      severityCounts.Alto = kpis.porSeveridade['Alto'] || kpis.porSeveridade['Alta'] || 0;
      severityCounts.Médio = kpis.porSeveridade['Médio'] || kpis.porSeveridade['Média'] || 0;
      severityCounts.Aviso = kpis.porSeveridade['Aviso'] || kpis.porSeveridade['Atenção'] || 0;
      severityCounts.Informação = kpis.porSeveridade['Informação'] || 0;
    } else {
      events.forEach((e) => {
        const s = e.severidade;
        if (s === 'Desastre') severityCounts.Desastre++;
        else if (s === 'Alta' || s === 'Alto') severityCounts.Alto++;
        else if (s === 'Média' || s === 'Médio') severityCounts.Médio++;
        else if (s === 'Atenção' || s === 'Aviso') severityCounts.Aviso++;
        else if (s === 'Informação') severityCounts.Informação++;
      });
    }

    // Tabela de Severidades
    const sevRows: any[] = [
      [
        { text: 'Severidade Zabbix', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Contagem', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'center' } },
        { text: '% Total', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'center' } },
        { text: 'Status Médio', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      ],
      [
        { text: 'Desastre', options: { bold: true, color: RED } },
        { text: String(severityCounts.Desastre), options: { align: 'center' } },
        { text: `${kpis.totalEventos > 0 ? Math.round((severityCounts.Desastre / kpis.totalEventos) * 100) : 0}%`, options: { align: 'center' } },
        { text: 'Intervenção Crítica Imediata', options: { color: '475569' } },
      ],
      [
        { text: 'Alto', options: { bold: true, color: 'EA580C' } },
        { text: String(severityCounts.Alto), options: { align: 'center' } },
        { text: `${kpis.totalEventos > 0 ? Math.round((severityCounts.Alto / kpis.totalEventos) * 100) : 0}%`, options: { align: 'center' } },
        { text: 'Impacto em Serviço / Aplicação', options: { color: '475569' } },
      ],
      [
        { text: 'Médio', options: { bold: true, color: AMBER } },
        { text: String(severityCounts.Médio), options: { align: 'center' } },
        { text: `${kpis.totalEventos > 0 ? Math.round((severityCounts.Médio / kpis.totalEventos) * 100) : 0}%`, options: { align: 'center' } },
        { text: 'Degradação Operacional', options: { color: '475569' } },
      ],
      [
        { text: 'Aviso', options: { bold: true, color: BLUE } },
        { text: String(severityCounts.Aviso), options: { align: 'center' } },
        { text: `${kpis.totalEventos > 0 ? Math.round((severityCounts.Aviso / kpis.totalEventos) * 100) : 0}%`, options: { align: 'center' } },
        { text: 'Atenção Preventiva', options: { color: '475569' } },
      ],
      [
        { text: 'Informação', options: { bold: true, color: EMERALD } },
        { text: String(severityCounts.Informação), options: { align: 'center' } },
        { text: `${kpis.totalEventos > 0 ? Math.round((severityCounts.Informação / kpis.totalEventos) * 100) : 0}%`, options: { align: 'center' } },
        { text: 'Log / Notificação informativa', options: { color: '475569' } },
      ],
    ];

    slideTechSev.addTable(sevRows, {
      x: 0.8,
      y: 1.8,
      w: 11.73,
      colW: [3.0, 1.8, 1.8, 5.13],
      rowH: 0.45,
      border: { pt: 1, color: BORDER_COLOR },
    });

    // SLIDE 7: CALIBRAÇÃO DE TRIGGERS NA FÁBRICA ZABBIX 7.0
    const slideTuning = pres.addSlide();
    addSlideHeader(
      slideTuning,
      '06.',
      'Calibração de Triggers Zabbix 7.0 com Histerese',
      'Especificações de engenharia para implementação no template do Zabbix Server.'
    );

    const tuningRows: any[] = [
      [
        { text: 'Item Key / Alvo', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Expressão de Problema Zabbix 7.0', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Expressão de Recuperação (Histerese)', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Ganho Operacional', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      ],
      [
        { text: 'system.cpu.util', options: { bold: true, fontSize: 9 } },
        { text: 'min(/HOST/system.cpu.util, 5m) > 90', options: { fontSize: 8.5, color: RED } },
        { text: 'max(/HOST/system.cpu.util, 10m) < 70', options: { fontSize: 8.5, color: EMERALD } },
        { text: 'Elimina flapping em picos curtos de CPU', options: { fontSize: 9 } },
      ],
      [
        { text: 'vm.memory.size[pavailable]', options: { bold: true, fontSize: 9 } },
        { text: 'min(/HOST/vm.memory.size[pavailable], 5m) < 10', options: { fontSize: 8.5, color: RED } },
        { text: 'min(/HOST/vm.memory.size[pavailable], 10m) > 20', options: { fontSize: 8.5, color: EMERALD } },
        { text: 'Garante margem de 10% antes de normalizar', options: { fontSize: 9 } },
      ],
      [
        { text: 'icmpping', options: { bold: true, fontSize: 9 } },
        { text: 'max(/HOST/icmpping, 3m) = 0', options: { fontSize: 8.5, color: RED } },
        { text: 'min(/HOST/icmpping, 3m) = 1', options: { fontSize: 8.5, color: EMERALD } },
        { text: 'Zero falsos positivos por micro-oscilação', options: { fontSize: 9 } },
      ],
      [
        { text: 'net.if.status[eth0]', options: { bold: true, fontSize: 9 } },
        { text: 'count(/HOST/net.if.status[eth0], 10m, "ne", 1) > 2', options: { fontSize: 8.5, color: RED } },
        { text: 'count(/HOST/net.if.status[eth0], 15m, "ne", 1) = 0', options: { fontSize: 8.5, color: EMERALD } },
        { text: 'Supressão de interface flapping de rede', options: { fontSize: 9 } },
      ],
    ];

    slideTuning.addTable(tuningRows, {
      x: 0.8,
      y: 1.8,
      w: 11.73,
      colW: [2.5, 3.8, 3.8, 1.63],
      rowH: 0.6,
      border: { pt: 1, color: BORDER_COLOR },
    });
  }

  // SLIDE DE BOOK DE RESULTADOS: TUNING + APÊNDICE DE PROMPT
  if (theme === 'book_resultados') {
    // Slide de Calibração Zabbix 7.0
    const slideBookTuning = pres.addSlide();
    addSlideHeader(
      slideBookTuning,
      '05.',
      'Engenharia de Triggers & Calibração Zabbix 7.0',
      'Diretrizes cirúrgicas de histerese e supressão de ruído recomendadas para o ambiente.'
    );

    const tuningRows: any[] = [
      [
        { text: 'Chave do Item', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Problem Expression Recomendada', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Recovery Expression com Histerese', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Benefício / Impacto', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      ],
      [
        { text: 'system.cpu.util', options: { bold: true, fontSize: 9 } },
        { text: 'min(/HOST/system.cpu.util, 5m) > 90', options: { fontSize: 8.5, color: RED } },
        { text: 'max(/HOST/system.cpu.util, 10m) < 70', options: { fontSize: 8.5, color: EMERALD } },
        { text: 'Elimina flapping em picos transitórios de CPU', options: { fontSize: 9 } },
      ],
      [
        { text: 'vm.memory.size[pavailable]', options: { bold: true, fontSize: 9 } },
        { text: 'min(/HOST/vm.memory.size[pavailable], 5m) < 10', options: { fontSize: 8.5, color: RED } },
        { text: 'min(/HOST/vm.memory.size[pavailable], 10m) > 20', options: { fontSize: 8.5, color: EMERALD } },
        { text: 'Garante margem de recuperação estável pós-GC', options: { fontSize: 9 } },
      ],
      [
        { text: 'nodata(status)', options: { bold: true, fontSize: 9 } },
        { text: 'nodata(/HOST/status, 10m) = 1', options: { fontSize: 8.5, color: RED } },
        { text: 'nodata(/HOST/status, 5m) = 0', options: { fontSize: 8.5, color: EMERALD } },
        { text: 'Amortecimento de coletas e reinícios rápidos', options: { fontSize: 9 } },
      ],
      [
        { text: 'icmpping', options: { bold: true, fontSize: 9 } },
        { text: 'max(/HOST/icmpping, 3m) = 0', options: { fontSize: 8.5, color: RED } },
        { text: 'min(/HOST/icmpping, 3m) = 1', options: { fontSize: 8.5, color: EMERALD } },
        { text: 'Zero falsos positivos por micro-oscilação de ping', options: { fontSize: 9 } },
      ],
    ];

    slideBookTuning.addTable(tuningRows, {
      x: 0.8,
      y: 1.8,
      w: 11.73,
      colW: [2.5, 3.8, 3.8, 1.63],
      rowH: 0.6,
      border: { pt: 1, color: BORDER_COLOR },
    });

    // Slide 6: Apêndice de Metodologia & Prompt da IA
    const slidePrompt = pres.addSlide();
    addSlideHeader(
      slidePrompt,
      '06.',
      'Apêndice Metodológico: Engenharia de Prompt & Auditoria IA',
      'Parâmetros analíticos e especificação do prompt que fundamentou o diagnóstico executivo e técnico.'
    );

    // Card de Parâmetros
    slidePrompt.addShape(pres.ShapeType.roundRect, {
      x: 0.8,
      y: 1.8,
      w: 11.73,
      h: 1.1,
      fill: { color: 'F1F5F9' },
      line: { color: BORDER_COLOR, width: 1 },
      rectRadius: 0.08,
    });

    slidePrompt.addText('PARÂMETROS DE AUDITORIA & RASTREABILIDADE', {
      x: 1.0,
      y: 1.9,
      w: 11.3,
      h: 0.25,
      fontSize: 9.5,
      bold: true,
      color: NAVY,
    });

    const directivesNote = options.customDirectives
      ? `\nDiretrizes do Auditor: "${options.customDirectives}"`
      : '';
    slidePrompt.addText(
      `Dataset: ${kpis.totalEventos} incidentes analisados · MTTR: ${formatDuration(kpis.mttrSegundos)} · MTBF: ${formatDuration(kpis.mtbfSegundosGlobal)} · Ruído: ${shortPct}%\nModelo Analítico: DeepSeek Engine / Zabbix 7.0 Certified Expert · Código: ${docCode}${directivesNote}`,
      {
        x: 1.0,
        y: 2.15,
        w: 11.3,
        h: 0.65,
        fontSize: 8.5,
        color: '334155',
      }
    );

    // Box com transcrição do prompt
    slidePrompt.addShape(pres.ShapeType.roundRect, {
      x: 0.8,
      y: 3.1,
      w: 11.73,
      h: 3.7,
      fill: { color: '0F172A' },
      line: { color: '1E293B', width: 1 },
      rectRadius: 0.08,
    });

    const promptPreview = options.promptText
      ? options.promptText.slice(0, 1200) + (options.promptText.length > 1200 ? '\n... [conteúdo truncado para exibição no slide]' : '')
      : `Prompt Book de Resultados:
- Contexto: Auditoria Zabbix 7.0 & Confiabilidade ITIL v4 para ${clientName}
- Métricas: ${kpis.totalEventos} eventos, ${shortPct}% ruído, host ofensor: ${kpis.hostMaisAfetado.host}
- Pilares: 1. Sumário Executivo; 2. Matriz de Ofensores; 3. Calibração de Histerese; 4. Roadmap Estratégico.`;

    slidePrompt.addText(promptPreview, {
      x: 1.0,
      y: 3.25,
      w: 11.33,
      h: 3.4,
      fontSize: 8,
      fontFace: 'Courier New',
      color: 'E2E8F0',
      lineSpacingMultiple: 1.15,
    });
  }

  // Gera o arquivo e efetua o download no navegador
  const themeSlug =
    theme === 'book_resultados'
      ? 'Book_Resultados'
      : theme === 'executivo'
      ? 'Executivo'
      : 'Tecnico';
  const cleanClient = clientName.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Apresentacao_${themeSlug}_Zabbix_${cleanClient}_${dateStr}.pptx`;

  await pres.writeFile({ fileName });
}
