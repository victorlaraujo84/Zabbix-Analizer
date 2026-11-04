import React, { useState } from 'react';
import { ZabbixKPIs, ComparativeMetricsResult } from '../types/zabbix';
import { formatDuration } from '../utils/parser';
import {
  Activity,
  AlertTriangle,
  Clock,
  Server,
  Zap,
  CheckCircle2,
  Timer,
  ShieldCheck,
  Repeat,
  TrendingDown,
  TrendingUp,
  Info,
  X,
} from 'lucide-react';

interface KPICardsProps {
  kpis: ZabbixKPIs;
  comparativeMetrics?: ComparativeMetricsResult | null;
  onSelectHost?: (host: string) => void;
  onSelectTrigger?: (trigger: string) => void;
}

export const KPICards: React.FC<KPICardsProps> = ({ kpis, comparativeMetrics, onSelectHost, onSelectTrigger }) => {
  const [showMtbfModal, setShowMtbfModal] = useState(false);
  const [showDispModal, setShowDispModal] = useState(false);
  const hasOpenIncidents = kpis.totalAbertos > 0;
  const isAckRateGood = kpis.taxaAtuacaoPercentual >= 70;
  const hasComp = !!comparativeMetrics?.hasComparison;

  const dispPct = kpis.taxaDisponibilidadeMediaPct ?? kpis.mtbfDetails?.taxaDisponibilidadePct ?? 100;
  const isDispSlaMet = dispPct >= 99.0;
  const isDispWarning = dispPct < 99.0 && dispPct >= 95.0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-9 gap-3 mb-6">
      {/* 1. Total de Eventos */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">Total Eventos</span>
          <Activity className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {kpis.totalEventos}
          </div>
          {hasComp && comparativeMetrics && (
            <span
              className={`text-[10px] font-mono font-bold px-1 rounded flex items-center ${
                comparativeMetrics.volumeDeltaCount > 0
                  ? 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/60'
                  : comparativeMetrics.volumeDeltaCount < 0
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60'
                  : 'text-slate-500 bg-slate-100'
              }`}
              title={`Período Comparativo: ${comparativeMetrics.comparisonKpis.totalEventos} eventos`}
            >
              {comparativeMetrics.volumeDeltaCount > 0 ? `+${comparativeMetrics.volumeDeltaCount}` : comparativeMetrics.volumeDeltaCount}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
          {hasComp && comparativeMetrics ? (
            <span title={comparativeMetrics.comparisonPeriodLabel}>Ref: {comparativeMetrics.comparisonKpis.totalEventos}</span>
          ) : (
            `${kpis.totalResolvidos} resolvidos`
          )}
        </div>
      </div>

      {/* 2. Incidentes em Aberto */}
      <div
        className={`border rounded-xl p-3.5 transition-colors ${
          hasOpenIncidents
            ? 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span
            className={`text-[11px] font-medium tracking-tight ${
              hasOpenIncidents ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Em Aberto
          </span>
          <AlertTriangle
            className={`w-3.5 h-3.5 ${
              hasOpenIncidents ? 'text-red-600 dark:text-red-400' : 'text-slate-400'
            }`}
          />
        </div>
        <div
          className={`text-xl font-bold font-mono tabular-nums ${
            hasOpenIncidents ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
          }`}
        >
          {kpis.totalAbertos}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">
          {hasOpenIncidents ? 'Atenção imediata' : 'Nenhum pendente'}
        </div>
      </div>

      {/* 3. Duração Total */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">Duração Total</span>
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div
          className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate"
          title={formatDuration(kpis.duracaoTotalSegundos)}
        >
          {formatDuration(kpis.duracaoTotalSegundos)}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">
          Acumulado
        </div>
      </div>

      {/* 4. Disponibilidade Média do Ambiente */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors relative">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">Disponibilidade</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowDispModal(true)}
              className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-0.5 rounded transition-colors cursor-pointer"
              title="Exibir memória de cálculo e disponibilidade por host"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <CheckCircle2
              className={`w-3.5 h-3.5 ${
                isDispSlaMet
                  ? 'text-emerald-500'
                  : isDispWarning
                  ? 'text-amber-500'
                  : 'text-red-500'
              }`}
            />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              isDispSlaMet
                ? 'text-emerald-600 dark:text-emerald-400'
                : isDispWarning
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {dispPct.toFixed(2)}%
          </div>
        </div>
        <div
          className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums truncate"
          title={`Base de ${kpis.totalHorasPlanejadasPeriodo || 720} horas (${kpis.totalDiasPeriodo || 30} dias) no regime 24x7`}
        >
          Base: {kpis.totalHorasPlanejadasPeriodo || 720}h ({kpis.totalDiasPeriodo || 30}d)
        </div>
      </div>

      {/* 5. MTTR (Mean Time To Resolve) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">MTTR Médio</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <div
            className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 truncate"
            title={formatDuration(kpis.mttrSegundos)}
          >
            {formatDuration(kpis.mttrSegundos)}
          </div>
          {hasComp && comparativeMetrics && comparativeMetrics.comparisonKpis.mttrSegundos > 0 && (
            <span
              className={`text-[10px] font-mono font-bold px-1 rounded flex items-center shrink-0 ${
                comparativeMetrics.mttrDeltaSeconds < 0
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60'
                  : comparativeMetrics.mttrDeltaSeconds > 0
                  ? 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/60'
                  : 'text-slate-500 bg-slate-100'
              }`}
              title={`Período Comparativo: ${formatDuration(comparativeMetrics.comparisonKpis.mttrSegundos)}`}
            >
              {comparativeMetrics.mttrDeltaSeconds < 0 ? '▼ ' : comparativeMetrics.mttrDeltaSeconds > 0 ? '▲ +' : ''}
              {formatDuration(Math.abs(comparativeMetrics.mttrDeltaSeconds))}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
          {hasComp && comparativeMetrics && comparativeMetrics.comparisonKpis.mttrSegundos > 0 ? (
            <span title={comparativeMetrics.comparisonPeriodLabel}>Ref: {formatDuration(comparativeMetrics.comparisonKpis.mttrSegundos)}</span>
          ) : (
            'Tempo de recuperação'
          )}
        </div>
      </div>

      {/* 5. MTBF (Mean Time Between Failures) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors relative">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">MTBF Global</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowMtbfModal(true)}
              className="text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 p-0.5 rounded transition-colors cursor-pointer"
              title="Exibir memória de cálculo e componentes NOC do MTBF"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <Repeat className="w-3.5 h-3.5 text-cyan-500" />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <div
            className="text-base font-bold font-mono tabular-nums text-cyan-600 dark:text-cyan-400 truncate"
            title={`MTBF Global: ${formatDuration(kpis.mtbfSegundosGlobal)} | MTBF Host Crítico: ${formatDuration(kpis.mtbfSegundosHostCritico)}`}
          >
            {formatDuration(kpis.mtbfSegundosGlobal)}
          </div>
          {hasComp && comparativeMetrics && comparativeMetrics.comparisonKpis.mtbfSegundosGlobal > 0 && (
            <span
              className={`text-[10px] font-mono font-bold px-1 rounded flex items-center shrink-0 ${
                comparativeMetrics.mtbfDeltaSeconds > 0
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60'
                  : comparativeMetrics.mtbfDeltaSeconds < 0
                  ? 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/60'
                  : 'text-slate-500 bg-slate-100'
              }`}
              title={`Período Comparativo: ${formatDuration(comparativeMetrics.comparisonKpis.mtbfSegundosGlobal)}`}
            >
              {comparativeMetrics.mtbfDeltaSeconds > 0 ? '▲ +' : comparativeMetrics.mtbfDeltaSeconds < 0 ? '▼ ' : ''}
              {formatDuration(Math.abs(comparativeMetrics.mtbfDeltaSeconds))}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 truncate font-mono tabular-nums" title={`Host crítico: ${formatDuration(kpis.mtbfSegundosHostCritico)}`}>
          {kpis.mtbfDetails ? (
            <span className="text-cyan-700 dark:text-cyan-400 font-semibold">
              {kpis.mtbfDetails.numeroFalhasCriticas === 1
                ? '1 falha crítica (NOC)'
                : `${kpis.mtbfDetails.numeroFalhasCriticas} falhas críticas (NOC)`}
            </span>
          ) : hasComp && comparativeMetrics && comparativeMetrics.comparisonKpis.mtbfSegundosGlobal > 0 ? (
            <span title={comparativeMetrics.comparisonPeriodLabel}>Ref: {formatDuration(comparativeMetrics.comparisonKpis.mtbfSegundosGlobal)}</span>
          ) : (
            `Host crítico: ${formatDuration(kpis.mtbfSegundosHostCritico)}`
          )}
        </div>
      </div>

      {/* 6. Percentual de Atuação (Alarmes Reconhecidos) - NOVO */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">Atuação (Ack)</span>
          <ShieldCheck className={`w-3.5 h-3.5 ${isAckRateGood ? 'text-blue-500' : 'text-amber-500'}`} />
        </div>
        <div
          className={`text-xl font-bold font-mono tabular-nums ${
            isAckRateGood ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
          }`}
        >
          {kpis.taxaAtuacaoPercentual}%
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
          {kpis.totalReconhecidos} de {kpis.totalEventos} acks
        </div>
      </div>

      {/* 7. Host Mais Afetado */}
      {(() => {
        const hostName = typeof kpis.hostMaisAfetado?.host === 'object' && kpis.hostMaisAfetado?.host !== null
          ? ((kpis.hostMaisAfetado.host as any).host || 'Desconhecido')
          : String(kpis.hostMaisAfetado?.host || 'Nenhum');
        const hostCount = typeof kpis.hostMaisAfetado?.count === 'number' ? kpis.hostMaisAfetado.count : 0;

        return (
          <div
            onClick={() => hostName !== 'Nenhum' && onSelectHost?.(hostName)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 group"
            title="Clique para filtrar por este host"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium tracking-tight">Host Crítico</span>
              <Server className="w-3.5 h-3.5 group-hover:text-blue-500 transition-colors" />
            </div>
            <div className="text-xs font-bold font-mono text-slate-900 dark:text-white truncate">
              {hostName}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
              {hostCount} eventos
            </div>
          </div>
        );
      })()}

      {/* 8. Trigger Mais Frequente */}
      {(() => {
        const triggerName = typeof kpis.triggerMaisFrequente?.trigger === 'object' && kpis.triggerMaisFrequente?.trigger !== null
          ? ((kpis.triggerMaisFrequente.trigger as any).trigger || (kpis.triggerMaisFrequente.trigger as any).name || 'Desconhecida')
          : String(kpis.triggerMaisFrequente?.trigger || 'Nenhuma');
        const triggerCount = typeof kpis.triggerMaisFrequente?.count === 'number' ? kpis.triggerMaisFrequente.count : 0;

        return (
          <div
            onClick={() => triggerName !== 'Nenhuma' && onSelectTrigger?.(triggerName)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 group"
            title="Clique para filtrar por este alarme"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium tracking-tight">Trigger Crítica</span>
              <Zap className="w-3.5 h-3.5 group-hover:text-amber-500 transition-colors" />
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate" title={triggerName}>
              {triggerName}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
              {triggerCount} ocorrências
            </div>
          </div>
        );
      })()}

      {/* Modal de Detalhamento e Memória de Cálculo MTBF (Critérios NOC) */}
      {showMtbfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 text-slate-900 dark:text-white space-y-4">
            <button
              type="button"
              onClick={() => setShowMtbfModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                <Repeat className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Componentes do Cálculo MTBF no NOC</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mean Time Between Failures com critérios operacionais de confiabilidade
                </p>
              </div>
            </div>

            {/* Fórmula em destaque */}
            <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs border border-slate-800 text-center space-y-1">
              <div className="text-[10px] text-cyan-400 uppercase tracking-wider font-bold">Fórmula Operacional NOC</div>
              <div className="text-sm font-bold text-white tracking-wide">
                MTBF = (Uptime Planejado − Downtime) ÷ Número de Falhas
              </div>
            </div>

            {/* Detalhamento das 3 variáveis oficiais */}
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    1. Tempo Total de Operação (Uptime Planejado 24x7)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Janela contínua 24x7 ({kpis.totalDiasPeriodo || 30} dias = {kpis.totalHorasPlanejadasPeriodo || 720}h)
                    {(kpis.mtbfDetails?.downtimePlanejadoSegundos || 0) > 0 && (
                      <span className="block text-amber-600 dark:text-amber-400 text-[10px]">
                        (descontadas {formatDuration(kpis.mtbfDetails?.downtimePlanejadoSegundos || 0)} de janelas de manutenção preventiva)
                      </span>
                    )}
                  </span>
                </div>
                <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                  {formatDuration(kpis.mtbfDetails?.uptimePlanejadoSegundos || 0)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    2. Tempo Total de Inatividade (Downtime Não Planejado)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tempo acumulado fora do ar devido a falhas críticas reais
                  </span>
                </div>
                <span className="font-mono font-bold text-red-600 dark:text-red-400 shrink-0">
                  {formatDuration(kpis.mtbfDetails?.downtimeNaoPlanejadoSegundos || 0)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    3. Número de Falhas Críticas (Divisor)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Incidentes com severidade Desastre, Alta ou indisponibilidade de links e servidores
                  </span>
                </div>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 shrink-0">
                  {kpis.mtbfDetails?.numeroFalhasCriticas || 0} falhas
                </span>
              </div>
            </div>

            {/* Resultado Final Consolidado */}
            <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 flex items-center justify-between text-xs">
              <div>
                <span className="text-[11px] font-bold text-cyan-900 dark:text-cyan-300 block">
                  MTBF Global Consolidado
                </span>
                <span className="text-[10px] text-cyan-700 dark:text-cyan-400">
                  Disponibilidade Média: {dispPct.toFixed(2)}%
                </span>
              </div>
              <div className="text-lg font-black font-mono text-cyan-700 dark:text-cyan-300">
                {formatDuration(kpis.mtbfSegundosGlobal)}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowMtbfModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhamento da Disponibilidade por Host */}
      {showDispModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-5 h-5 ${isDispSlaMet ? 'text-emerald-500' : isDispWarning ? 'text-amber-500' : 'text-red-500'}`} />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Auditoria de Disponibilidade do Ambiente (SLA NOC)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Média aritmética de disponibilidade individual dos hosts no regime 24x7
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDispModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Destaque das Horas do Período */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Base do Mês / Período</span>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  {kpis.totalHorasPlanejadasPeriodo || 720}h
                </div>
                <span className="text-[10px] text-slate-400">
                  {kpis.totalDiasPeriodo || 30} dias × 24h
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Meta Contratual SLA</span>
                <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                  99.00%
                </div>
                <span className="text-[10px] text-slate-400">Objetivo operacional</span>
              </div>
              <div className={`p-2.5 rounded-xl border ${
                isDispSlaMet
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-300'
                  : isDispWarning
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-300'
              }`}>
                <span className="text-[10px] block font-medium opacity-80">Disponibilidade Média</span>
                <div className="text-base font-bold font-mono mt-0.5">
                  {dispPct.toFixed(2)}%
                </div>
                <span className="text-[10px] font-semibold">
                  {isDispSlaMet ? '✓ Meta Atingida' : '⚠ Degradação de SLA'}
                </span>
              </div>
            </div>

            {/* Tabela de Hosts */}
            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-2.5">Host / Ativo</th>
                    <th className="p-2.5 text-center">Falhas Críticas</th>
                    <th className="p-2.5 text-center">Downtime</th>
                    <th className="p-2.5 text-right">Disponibilidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {(kpis.disponibilidadePorHost && kpis.disponibilidadePorHost.length > 0) ? (
                    kpis.disponibilidadePorHost.map((item, idx) => {
                      const met = item.disponibilidadePct >= 99.0;
                      return (
                        <tr
                          key={idx}
                          onClick={() => {
                            onSelectHost?.(item.host);
                            setShowDispModal(false);
                          }}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                          title="Clique para filtrar por este host"
                        >
                          <td className="p-2.5 font-bold font-sans text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[220px]">{item.host}</span>
                          </td>
                          <td className="p-2.5 text-center text-slate-700 dark:text-slate-300">
                            {item.falhasCriticas}
                          </td>
                          <td className="p-2.5 text-center text-slate-700 dark:text-slate-300">
                            {formatDuration(item.downtimeSegundos)}
                          </td>
                          <td className="p-2.5 text-right font-bold">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              met
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                            }`}>
                              {item.disponibilidadePct.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400">
                        Nenhum host disponível no escopo filtrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Total de {kpis.disponibilidadePorHost?.length || 0} hosts monitorados no escopo.
              </span>
              <button
                type="button"
                onClick={() => setShowDispModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
