import React from 'react';
import { TrendsComparison } from '../types/zabbix';
import { formatDuration } from '../utils/parser';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Repeat,
  ShieldCheck,
  Server,
  Zap,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';

interface TrendsViewProps {
  comparison: TrendsComparison;
}

export const TrendsView: React.FC<TrendsViewProps> = ({ comparison }) => {
  // Volume: Mais incidentes = Degradação (vermelho), Menos incidentes = Melhoria (verde)
  const isVolumeImproved = comparison.volumeDeltaCount < 0;
  const isVolumeDegraded = comparison.volumeDeltaCount > 0;

  // MTTR: Tempo menor = Melhoria (verde), Tempo maior = Degradação (vermelho)
  const isMttrImproved = comparison.mttrDeltaSeconds < 0;
  const isMttrDegraded = comparison.mttrDeltaSeconds > 0;

  // MTBF: Tempo maior = Melhoria (verde), Tempo menor = Degradação (vermelho)
  const isMtbfImproved = comparison.mtbfDeltaSeconds > 0;
  const isMtbfDegraded = comparison.mtbfDeltaSeconds < 0;

  // Taxa de Atuação: Maior = Melhoria (verde)
  const isAckImproved = comparison.ackDeltaPct > 0;
  const isAckDegraded = comparison.ackDeltaPct < 0;

  return (
    <div className="space-y-6">
      {/* Header do Comparativo de Períodos */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Análise de Confiabilidade &amp; Tendências
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold uppercase">
                Período Equivalente
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              Comparativo de Desempenho e Degradação
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Avaliação do comportamento dos incidentes em relação ao período imediatamente anterior de mesma duração.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shrink-0">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Período Anterior</span>
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                {comparison.previousPeriod.label}
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 mx-1 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold text-red-600 dark:text-red-400">
                Período Atual (Filtro)
              </span>
              <span className="text-slate-900 dark:text-white font-bold">
                {comparison.currentPeriod.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Cards Comparativos de Métricas Chave com Destaque de Degradação / Melhoria */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Volume de Incidentes */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Volume de Incidentes</span>
            <Activity className="w-4 h-4" />
          </div>

          <div className="flex items-baseline justify-between gap-2 mb-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {comparison.currentKpis.totalEventos}
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-400">
              Ant: {comparison.previousKpis.totalEventos}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <div
              className={`flex items-center gap-1 font-semibold font-mono tabular-nums ${
                isVolumeDegraded
                  ? 'text-red-600 dark:text-red-400'
                  : isVolumeImproved
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {isVolumeDegraded ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : isVolumeImproved ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              <span>
                {comparison.volumeDeltaPct > 0 ? `+${comparison.volumeDeltaPct}%` : `${comparison.volumeDeltaPct}%`}
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                ({comparison.volumeDeltaCount > 0 ? `+${comparison.volumeDeltaCount}` : comparison.volumeDeltaCount} eventos)
              </span>
            </div>

            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isVolumeDegraded
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                  : isVolumeImproved
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {isVolumeDegraded ? 'Degradação' : isVolumeImproved ? 'Melhoria' : 'Estável'}
            </span>
          </div>
        </div>

        {/* 2. MTTR Médio (Mean Time To Resolve) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">MTTR (Tempo de Recuperação)</span>
            <Clock className="w-4 h-4" />
          </div>

          <div className="flex items-baseline justify-between gap-2 mb-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
              {formatDuration(comparison.currentKpis.mttrSegundos)}
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-400 truncate">
              Ant: {formatDuration(comparison.previousKpis.mttrSegundos)}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <div
              className={`flex items-center gap-1 font-semibold font-mono tabular-nums ${
                isMttrDegraded
                  ? 'text-red-600 dark:text-red-400'
                  : isMttrImproved
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {isMttrDegraded ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : isMttrImproved ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              <span>
                {comparison.mttrDeltaPct > 0 ? `+${comparison.mttrDeltaPct}%` : `${comparison.mttrDeltaPct}%`}
              </span>
            </div>

            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isMttrDegraded
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                  : isMttrImproved
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {isMttrDegraded ? 'Degradação (Mais Lento)' : isMttrImproved ? 'Melhoria (Mais Ágil)' : 'Estável'}
            </span>
          </div>
        </div>

        {/* 3. MTBF (Mean Time Between Failures) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">MTBF (Tempo Entre Falhas)</span>
            <Repeat className="w-4 h-4 text-cyan-500" />
          </div>

          <div className="flex items-baseline justify-between gap-2 mb-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
              {formatDuration(comparison.currentKpis.mtbfSegundosGlobal)}
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-400 truncate">
              Ant: {formatDuration(comparison.previousKpis.mtbfSegundosGlobal)}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <div
              className={`flex items-center gap-1 font-semibold font-mono tabular-nums ${
                isMtbfImproved
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isMtbfDegraded
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-400'
              }`}
            >
              {isMtbfImproved ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : isMtbfDegraded ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              <span>
                {comparison.mtbfDeltaPct > 0 ? `+${comparison.mtbfDeltaPct}%` : `${comparison.mtbfDeltaPct}%`}
              </span>
            </div>

            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isMtbfImproved
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : isMtbfDegraded
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {isMtbfImproved ? 'Melhoria (Mais Estável)' : isMtbfDegraded ? 'Degradação (Mais Falhas)' : 'Estável'}
            </span>
          </div>
        </div>

        {/* 4. Taxa de Atuação do NOC (Ack Rate) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Taxa de Atuação (Ack)</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>

          <div className="flex items-baseline justify-between gap-2 mb-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {comparison.currentKpis.taxaAtuacaoPercentual}%
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-400">
              Ant: {comparison.previousKpis.taxaAtuacaoPercentual}%
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <div
              className={`flex items-center gap-1 font-semibold font-mono tabular-nums ${
                isAckImproved
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isAckDegraded
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-400'
              }`}
            >
              {isAckImproved ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : isAckDegraded ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              <span>
                {comparison.ackDeltaPct > 0 ? `+${comparison.ackDeltaPct} pp` : `${comparison.ackDeltaPct} pp`}
              </span>
            </div>

            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isAckImproved
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : isAckDegraded
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {isAckImproved ? 'Maior Engajamento' : isAckDegraded ? 'Atenção Operacional' : 'Estável'}
            </span>
          </div>
        </div>
      </div>

      {/* Diagnóstico Executivo de Tendência */}
      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-5 transition-colors">
        <div className="flex items-center gap-2 mb-2">
          {isVolumeDegraded || isMttrDegraded ? (
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Conclusão de Tendência &amp; Variação Operacional
          </h3>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {isVolumeDegraded && isMttrDegraded && (
            <span>
              <strong>Alerta de Degradação Dupla:</strong> O ambiente registrou um aumento de <strong>{comparison.volumeDeltaPct}%</strong> no volume de incidentes concomitante a um aumento de <strong>{comparison.mttrDeltaPct}%</strong> no tempo médio de resolução (MTTR). A infraestrutura exigiu maior esforço do time operacional.
            </span>
          )}
          {isVolumeDegraded && !isMttrDegraded && (
            <span>
              <strong>Aumento de Volume com Resolução Eficiente:</strong> Houve um acréscimo de <strong>{comparison.volumeDeltaPct}%</strong> no volume de alarmes, porém o MTTR reduziu em <strong>{Math.abs(comparison.mttrDeltaPct)}%</strong>, indicando capacidade de resposta rápida pelo time de suporte.
            </span>
          )}
          {!isVolumeDegraded && isMttrDegraded && (
            <span>
              <strong>Incidentes Mais Complexos:</strong> O volume total recuou em <strong>{Math.abs(comparison.volumeDeltaPct)}%</strong>, contudo a duração média de recuperação (MTTR) expandiu em <strong>{comparison.mttrDeltaPct}%</strong>, sugerindo falhas com maior grau de complexidade ou dependências externas.
            </span>
          )}
          {!isVolumeDegraded && !isMttrDegraded && (
            <span>
              <strong>Melhoria Consistente de Saúde:</strong> O período atual apresentou melhora tanto na estabilidade (redução de <strong>{Math.abs(comparison.volumeDeltaPct)}%</strong> no volume de incidentes) quanto na agilidade de recuperação (MTTR reduzido em <strong>{Math.abs(comparison.mttrDeltaPct)}%</strong>).
            </span>
          )}
        </p>
      </div>

      {/* Seção de Hosts e Triggers com Maior Degradação / Variação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tabela de Hosts com Maior Degradação (Aumento de Incidentes) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-red-500" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Hosts com Maior Degradação (Aumento de Alarmes)
              </h4>
            </div>
            <span className="text-[10px] text-slate-400">Δ vs Período Anterior</span>
          </div>

          {comparison.degradedHosts.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {comparison.degradedHosts.map((h) => {
                const hostStr = typeof h.host === 'object' && h.host !== null ? ((h.host as any).host || String(h.host)) : String(h.host || '');
                return (
                <div key={hostStr} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-3">
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200 block truncate">
                      {hostStr}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {h.previousCount} eventos ➔ {h.currentCount} eventos
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-red-600 dark:text-red-400">
                      +{h.delta}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-semibold font-mono">
                      +{h.deltaPct}%
                    </span>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              Nenhum host registrou aumento no volume de incidentes em relação ao período anterior.
            </div>
          )}
        </div>

        {/* Tabela de Triggers Emergentes / com Maior Reincidência */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Triggers com Maior Disparada de Ocorrências
              </h4>
            </div>
            <span className="text-[10px] text-slate-400">Δ vs Período Anterior</span>
          </div>

          {comparison.degradedTriggers.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {comparison.degradedTriggers.map((t) => (
                <div key={t.trigger} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-3">
                    <span className="font-medium text-slate-800 dark:text-slate-200 block truncate" title={t.trigger}>
                      {t.trigger}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {t.previousCount} ocor. ➔ {t.currentCount} ocor.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                      +{t.delta}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-semibold font-mono">
                      +{t.deltaPct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              Nenhuma trigger registrou alta de reincidência em relação ao período anterior.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
