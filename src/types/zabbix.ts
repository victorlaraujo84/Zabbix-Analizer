export type SeverityLevel = 'Desastre' | 'Alta' | 'Média' | 'Atenção' | 'Informação';

export type StatusType = 'RESOLVIDO' | 'INCIDENTE';

export interface ZabbixEvent {
  id: string;
  severidade: SeverityLevel | string;
  hora: string;
  dataInicio: Date | null;
  horaRecuperacao: string;
  dataFim: Date | null;
  status: StatusType | string;
  host: string;
  incidente: string; // Nome do incidente / conteúdo da trigger
  expressao?: string; // Expressão técnica Zabbix (ex: last(/host/system.cpu.util) > 90)
  duracaoTexto: string;
  duracaoSegundos: number;
  reconhecido: 'Sim' | 'Não' | string;
  acoes: string;
  etiquetasTexto: string;
  etiquetas: Record<string, string>;
  horaRecuperacaoISO?: string;
  duracaoISO?: string;
  eventId?: string;
  usuario?: string;
}

export type DurationPreset =
  | 'all'
  | 'noise_1m'     // < 1 minuto (flapping severo)
  | 'noise_5m'     // 1 a 5 minutos (ruído operacional)
  | 'medium_30m'   // 5 a 30 minutos
  | 'long_2h'      // 30m a 2 horas
  | 'critical_2h'; // > 2 horas

export interface ZabbixFilters {
  dateFrom: string; // YYYY-MM-DDTHH:mm
  dateTo: string;   // YYYY-MM-DDTHH:mm
  severidades: string[];
  hosts: string[];
  triggers: string[];
  status: 'Todos' | 'RESOLVIDO' | 'INCIDENTE';
  reconhecido: 'Todos' | 'Sim' | 'Não';
  tagKey: string;
  tagValues: string[];
  searchQuery: string;
  duracaoPreset: DurationPreset;
  duracaoMinMinutos: string; // Vazio ou número
  duracaoMaxMinutos: string; // Vazio ou número

  // Período Comparativo (Benchmark MTTR)
  comparisonEnabled?: boolean;
  comparisonPreset?: 'previous_period' | 'previous_month' | 'custom';
  comparisonDateFrom?: string; // YYYY-MM-DDTHH:mm
  comparisonDateTo?: string;   // YYYY-MM-DDTHH:mm

  // Filtro Avançado por Expressão e Métrica Zabbix (Fase 3)
  zabbixFunction?: string; // ex: 'todas', 'nodata', 'last', 'diff', 'avg', 'min', 'max', 'count', 'change'
  expressionQuery?: string; // Busca textual na expressão técnica Zabbix
}

export interface ZabbixKPIs {
  totalEventos: number;
  totalAbertos: number;
  totalResolvidos: number;
  duracaoTotalSegundos: number;
  duracaoMediaSegundos: number;
  hostMaisAfetado: { host: string; count: number; duracaoSegundos: number };
  triggerMaisFrequente: { trigger: string; count: number };
  mttrSegundos: number; // Média de duração apenas dos RESOLVIDOS
  mtbfSegundosGlobal: number; // Mean Time Between Failures Global
  mtbfSegundosHostCritico: number; // MTBF específico do host mais afetado
  totalReconhecidos: number;
  taxaAtuacaoPercentual: number; // % de alarmes com reconhecido === 'Sim'
  totalRuidoOperacional: number; // Total de eventos com < 5min
  taxaDisponibilidadeMediaPct?: number; // Média aritmética da disponibilidade individual dos hosts (%)
  totalHorasPlanejadasPeriodo?: number; // Horas totais planejadas (ex: 744h para 31 dias, 720h para 30 dias)
  totalDiasPeriodo?: number; // Quantidade de dias do período analisado (ex: 31, 30, 28)
  disponibilidadePorHost?: Array<{
    host: string;
    disponibilidadePct: number;
    downtimeSegundos: number;
    falhasCriticas: number;
  }>;
  porSeveridade?: Record<string, number>;
  mtbfDetails?: {
    uptimePlanejadoSegundos: number; // Janela 24x7 do período analisado
    downtimePlanejadoSegundos: number; // Janelas de manutenção programada / preventiva descontadas
    downtimeNaoPlanejadoSegundos: number; // Inatividade acumulada por falhas não planejadas
    uptimeEfetivoSegundos: number; // Tempo real de serviço ativo (Planejado - Downtimes)
    numeroFalhasCriticas: number; // Quantidade de falhas críticas/indisponibilidade
    taxaDisponibilidadePct: number; // Disponibilidade percentual do período
    totalDiasPeriodo?: number;
    totalHorasPlanejadasPeriodo?: number;
  };
}

export type TimelineBucket = '5m' | '15m' | '1h' | '1d';

export interface ChartItemConfig {
  id: string;
  title: string;
  description: string;
  visible: boolean;
  type?: 'bar' | 'line' | 'pie' | 'doughnut';
}

export interface SavedSession {
  id: string;
  name: string;
  timestamp: number;
  eventCount: number;
  events: ZabbixEvent[];
}

export interface TimelineAnomaly {
  bucket: string;
  count: number;
  mean: number;
  stdDev: number;
  threshold: number;
  sigmaCount: number;
}

export interface HostDelta {
  host: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  deltaPct: number;
}

export interface TriggerDelta {
  trigger: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  deltaPct: number;
}

export interface TrendsComparison {
  hasSufficientData: boolean;
  currentPeriod: { from: Date; to: Date; label: string };
  previousPeriod: { from: Date; to: Date; label: string };
  currentKpis: ZabbixKPIs;
  previousKpis: ZabbixKPIs;
  volumeDeltaPct: number;
  volumeDeltaCount: number;
  mttrDeltaPct: number;
  mttrDeltaSeconds: number;
  mtbfDeltaPct: number;
  mtbfDeltaSeconds: number;
  ackDeltaPct: number;
  openDeltaCount: number;
  degradedHosts: HostDelta[];
  improvedHosts: HostDelta[];
  degradedTriggers: TriggerDelta[];
}

export interface ZabbixTriggerCatalogItem {
  id: string;
  host: string;
  name: string;
  expression: string;
  parsedItemKey?: string;
  parsedFunction?: string;
  parsedThreshold?: string;
}

export interface ClientTriggerCatalog {
  clientId: string;
  updatedAt: string;
  fileName: string;
  totalTriggers: number;
  items: ZabbixTriggerCatalogItem[];
}

export interface ReportSectionConfig {
  includeCover: boolean;
  includeStructuredHeader: boolean;
  includeExecutiveSummary: boolean;
  includeTuningAnalysis: boolean;
  includeKpiCharts: boolean;
  includeActionPlan: boolean;
  includeEventsSample: boolean;
}

export interface ReportBrandingConfig {
  reportTitle?: string;
  defaultReportTitle?: string;
  documentCode?: string;
  docCodePrefix?: string;
  revision?: string;
  publicationDate?: string;
  revisionDate?: string;
  elaborator?: string;
  approver?: string;
  operationalModel?: string;
  departmentTags?: string[];
  selectedDepartmentTag?: string;
  objectiveDescription?: string;
  coverSubtitle?: string;
  logoDataUrl?: string;
  coverImageDataUrl?: string;
  accentColor?: string;
  headerStyle?: 'modelo_estruturado' | 'executivo_moderno' | 'pop_tecnico';
  includeCover?: boolean;
  coverStyle?: 'padrao_oficial' | 'institucional_gradient' | 'minimalista_tecnica' | 'pop_oficial';
  sections?: ReportSectionConfig;
  operationalContextNotes?: string[];
}

export interface ComparativeMetricsResult {
  hasComparison: boolean;
  baselineKpis: ZabbixKPIs;
  comparisonKpis: ZabbixKPIs;
  comparisonPeriodLabel: string;
  mttrDeltaSeconds: number; // baseline - comparison (negativo = melhorou/mais rápido)
  mttrDeltaPct: number;
  mtbfDeltaSeconds: number; // baseline - comparison (positivo = melhorou/mais tempo entre falhas)
  mtbfDeltaPct: number;
  volumeDeltaCount: number; // baseline - comparison
  volumeDeltaPct: number;
  noiseDeltaCount: number;
  noiseDeltaPct: number;
}

