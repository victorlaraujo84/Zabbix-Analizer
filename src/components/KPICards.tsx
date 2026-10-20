import React from 'react';
import { ZabbixKPIs } from '../types/zabbix';
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
} from 'lucide-react';

interface KPICardsProps {
  kpis: ZabbixKPIs;
  onSelectHost?: (host: string) => void;
  onSelectTrigger?: (trigger: string) => void;
}

export const KPICards: React.FC<KPICardsProps> = ({ kpis, onSelectHost, onSelectTrigger }) => {
  const hasOpenIncidents = kpis.totalAbertos > 0;
  const isAckRateGood = kpis.taxaAtuacaoPercentual >= 70;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3 mb-6">
      {/* 1. Total de Eventos */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">Total Eventos</span>
          <Activity className="w-3.5 h-3.5" />
        </div>
        <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
          {kpis.totalEventos}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
          {kpis.totalResolvidos} resolvidos
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

      {/* 4. MTTR (Mean Time To Resolve) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">MTTR Médio</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <div
          className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 truncate"
          title={formatDuration(kpis.mttrSegundos)}
        >
          {formatDuration(kpis.mttrSegundos)}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">
          Tempo de recuperação
        </div>
      </div>

      {/* 5. MTBF (Mean Time Between Failures) - NOVO */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">MTBF Global</span>
          <Repeat className="w-3.5 h-3.5 text-cyan-500" />
        </div>
        <div
          className="text-base font-bold font-mono tabular-nums text-cyan-600 dark:text-cyan-400 truncate"
          title={`MTBF Global: ${formatDuration(kpis.mtbfSegundosGlobal)} | MTBF Host Crítico: ${formatDuration(kpis.mtbfSegundosHostCritico)}`}
        >
          {formatDuration(kpis.mtbfSegundosGlobal)}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 truncate font-mono tabular-nums" title={`Host crítico: ${formatDuration(kpis.mtbfSegundosHostCritico)}`}>
          Host crítico: {formatDuration(kpis.mtbfSegundosHostCritico)}
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
      <div
        onClick={() => kpis.hostMaisAfetado.host !== 'Nenhum' && onSelectHost?.(kpis.hostMaisAfetado.host)}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 group"
        title="Clique para filtrar por este host"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">Host Crítico</span>
          <Server className="w-3.5 h-3.5 group-hover:text-blue-500 transition-colors" />
        </div>
        <div className="text-xs font-bold font-mono text-slate-900 dark:text-white truncate">
          {kpis.hostMaisAfetado.host}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
          {kpis.hostMaisAfetado.count} eventos
        </div>
      </div>

      {/* 8. Trigger Mais Frequente */}
      <div
        onClick={() => kpis.triggerMaisFrequente.trigger !== 'Nenhuma' && onSelectTrigger?.(kpis.triggerMaisFrequente.trigger)}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 transition-colors cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 group"
        title="Clique para filtrar por este alarme"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span className="text-[11px] font-medium tracking-tight">Trigger Crítica</span>
          <Zap className="w-3.5 h-3.5 group-hover:text-amber-500 transition-colors" />
        </div>
        <div className="text-xs font-bold text-slate-900 dark:text-white truncate" title={kpis.triggerMaisFrequente.trigger}>
          {kpis.triggerMaisFrequente.trigger}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
          {kpis.triggerMaisFrequente.count} ocorrências
        </div>
      </div>
    </div>
  );
};
