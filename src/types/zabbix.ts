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
  incidente: string;
  duracaoTexto: string;
  duracaoSegundos: number;
  reconhecido: 'Sim' | 'Não' | string;
  acoes: string;
  etiquetasTexto: string;
  etiquetas: Record<string, string>;
  horaRecuperacaoISO?: string;
  duracaoISO?: string;
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
