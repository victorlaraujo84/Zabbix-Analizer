import React, { useState, useMemo } from 'react';
import { ZabbixEvent, ZabbixFilters, DurationPreset } from '../types/zabbix';
import { SEVERITY_COLORS, SEVERITY_ORDER } from '../utils/analytics';
import { toDateTimeLocalString } from '../utils/parser';
import { Filter, Search, RotateCcw, Calendar, Clock, Tag } from 'lucide-react';

interface FilterPanelProps {
  rawEvents: ZabbixEvent[];
  filteredEvents: ZabbixEvent[];
  filters: ZabbixFilters;
  onFilterChange: (newFilters: ZabbixFilters) => void;
  onResetFilters: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  rawEvents,
  filteredEvents,
  filters,
  onFilterChange,
  onResetFilters,
}) => {
  const [hostSearch, setHostSearch] = useState('');
  const [triggerSearch, setTriggerSearch] = useState('');

  // Limites mínimo e máximo de data do dataset original
  const { minDate, maxDate } = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const e of rawEvents) {
      if (e.dataInicio) {
        if (!min || e.dataInicio < min) min = e.dataInicio;
        if (!max || e.dataInicio > max) max = e.dataInicio;
      }
    }
    return { minDate: min, maxDate: max };
  }, [rawEvents]);

  // Contagens por severidade
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sev of SEVERITY_ORDER) counts[sev] = 0;
    for (const e of filteredEvents) {
      counts[e.severidade] = (counts[e.severidade] || 0) + 1;
    }
    return counts;
  }, [filteredEvents]);

  // Lista única de hosts com contagens
  const hostList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of rawEvents) {
      counts[e.host] = (counts[e.host] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count);
  }, [rawEvents]);

  const filteredHostList = useMemo(() => {
    if (!hostSearch.trim()) return hostList;
    const q = hostSearch.toLowerCase();
    return hostList.filter((h) => h.host.toLowerCase().includes(q));
  }, [hostList, hostSearch]);

  // Lista única de triggers com contagens
  const triggerList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of rawEvents) {
      counts[e.incidente] = (counts[e.incidente] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([trigger, count]) => ({ trigger, count }))
      .sort((a, b) => b.count - a.count);
  }, [rawEvents]);

  const filteredTriggerList = useMemo(() => {
    if (!triggerSearch.trim()) return triggerList;
    const q = triggerSearch.toLowerCase();
    return triggerList.filter((t) => t.trigger.toLowerCase().includes(q));
  }, [triggerList, triggerSearch]);

  // Extrai chaves de etiquetas
  const uniqueTagKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const e of rawEvents) {
      Object.keys(e.etiquetas).forEach((k) => keys.add(k));
    }
    return Array.from(keys).sort();
  }, [rawEvents]);

  const tagValuesForSelectedKey = useMemo(() => {
    if (!filters.tagKey) return [];
    const values = new Set<string>();
    for (const e of rawEvents) {
      const val = e.etiquetas[filters.tagKey];
      if (val) values.add(val);
    }
    return Array.from(values).sort();
  }, [rawEvents, filters.tagKey]);

  // Handlers
  const handleSeverityToggle = (sev: string) => {
    const exists = filters.severidades.includes(sev);
    const updated = exists
      ? filters.severidades.filter((s) => s !== sev)
      : [...filters.severidades, sev];
    onFilterChange({ ...filters, severidades: updated });
  };

  const handleHostToggle = (host: string) => {
    const exists = filters.hosts.includes(host);
    const updated = exists ? filters.hosts.filter((h) => h !== host) : [...filters.hosts, host];
    onFilterChange({ ...filters, hosts: updated });
  };

  const handleTriggerToggle = (trigger: string) => {
    const exists = filters.triggers.includes(trigger);
    const updated = exists
      ? filters.triggers.filter((t) => t !== trigger)
      : [...filters.triggers, trigger];
    onFilterChange({ ...filters, triggers: updated });
  };

  const handleTagValueToggle = (val: string) => {
    const exists = filters.tagValues.includes(val);
    const updated = exists
      ? filters.tagValues.filter((v) => v !== val)
      : [...filters.tagValues, val];
    onFilterChange({ ...filters, tagValues: updated });
  };

  // Atalhos rápidos de período com 30 dias e Este Mês
  const applyQuickPeriod = (preset: '1h' | '6h' | '24h' | '7d' | '30d' | 'this_month' | 'all') => {
    if (preset === 'all') {
      onFilterChange({
        ...filters,
        dateFrom: minDate ? toDateTimeLocalString(minDate) : '',
        dateTo: maxDate ? toDateTimeLocalString(maxDate) : '',
      });
      return;
    }

    if (!maxDate) return;
    const end = new Date(maxDate.getTime());

    if (preset === 'this_month') {
      const startOfMonth = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0);
      onFilterChange({
        ...filters,
        dateFrom: toDateTimeLocalString(startOfMonth),
        dateTo: toDateTimeLocalString(end),
      });
      return;
    }

    let hoursBack = 1;
    if (preset === '1h') hoursBack = 1;
    else if (preset === '6h') hoursBack = 6;
    else if (preset === '24h') hoursBack = 24;
    else if (preset === '7d') hoursBack = 24 * 7;
    else if (preset === '30d') hoursBack = 24 * 30;

    const start = new Date(end.getTime() - hoursBack * 60 * 60 * 1000);
    onFilterChange({
      ...filters,
      dateFrom: toDateTimeLocalString(start),
      dateTo: toDateTimeLocalString(end),
    });
  };

  return (
    <aside className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Filtros Dinâmicos
          </h3>
        </div>
        <button
          onClick={onResetFilters}
          className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
        >
          <RotateCcw className="w-3 h-3" />
          Limpar
        </button>
      </div>

      <div className="space-y-5">
        {/* a) Filtro de Período (com 30 dias e Este Mês) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Período do Evento</span>
          </label>
          <div className="space-y-1.5">
            <div>
              <span className="text-[10px] text-slate-400 block mb-0.5">Início:</span>
              <input
                type="datetime-local"
                value={filters.dateFrom}
                onChange={(e) => onFilterChange({ ...filters, dateFrom: e.target.value })}
                className="w-full text-xs font-mono px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-red-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block mb-0.5">Fim:</span>
              <input
                type="datetime-local"
                value={filters.dateTo}
                onChange={(e) => onFilterChange({ ...filters, dateTo: e.target.value })}
                className="w-full text-xs font-mono px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-red-500"
              />
            </div>
          </div>

          {/* Atalhos rápidos de tempo incluindo 30 dias e Este mês */}
          <div className="flex flex-wrap gap-1 mt-2">
            <button
              type="button"
              onClick={() => applyQuickPeriod('1h')}
              className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded transition-colors cursor-pointer"
            >
              1h
            </button>
            <button
              type="button"
              onClick={() => applyQuickPeriod('6h')}
              className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded transition-colors cursor-pointer"
            >
              6h
            </button>
            <button
              type="button"
              onClick={() => applyQuickPeriod('24h')}
              className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded transition-colors cursor-pointer"
            >
              24h
            </button>
            <button
              type="button"
              onClick={() => applyQuickPeriod('7d')}
              className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded transition-colors cursor-pointer"
            >
              7 dias
            </button>
            <button
              type="button"
              onClick={() => applyQuickPeriod('30d')}
              className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded transition-colors cursor-pointer font-medium text-blue-600 dark:text-blue-400"
            >
              30 dias
            </button>
            <button
              type="button"
              onClick={() => applyQuickPeriod('this_month')}
              className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded transition-colors cursor-pointer font-medium text-blue-600 dark:text-blue-400"
            >
              Este mês
            </button>
            <button
              type="button"
              onClick={() => applyQuickPeriod('all')}
              className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded transition-colors cursor-pointer"
            >
              Todo o período
            </button>
          </div>
        </div>

        {/* NOVO: Filtro por Tempo de Duração (Presets de Ruído Operacional + Min/Max) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Filtro de Duração (Ruído)</span>
          </label>

          {/* Chips de Duração */}
          <div className="grid grid-cols-2 gap-1 mb-2">
            {[
              { id: 'all', label: 'Qualquer duração' },
              { id: 'noise_1m', label: '< 1m (Flapping)' },
              { id: 'noise_5m', label: '1m–5m (Ruído)' },
              { id: 'medium_30m', label: '5m–30m' },
              { id: 'long_2h', label: '30m–2h' },
              { id: 'critical_2h', label: '> 2h (Crítico)' },
            ].map((chip) => {
              const active = filters.duracaoPreset === chip.id;
              return (
                <button
                  type="button"
                  key={chip.id}
                  onClick={() =>
                    onFilterChange({
                      ...filters,
                      duracaoPreset: chip.id as DurationPreset,
                    })
                  }
                  className={`px-2 py-1 text-[11px] rounded transition-colors text-left cursor-pointer truncate ${
                    active
                      ? 'bg-red-600 text-white font-medium shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Min e Max customizados em minutos */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <span className="text-[10px] text-slate-400 block mb-0.5">Min (minutos):</span>
              <input
                type="number"
                min="0"
                placeholder="Ex: 5"
                value={filters.duracaoMinMinutos}
                onChange={(e) => onFilterChange({ ...filters, duracaoMinMinutos: e.target.value })}
                className="w-full text-xs font-mono px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-red-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block mb-0.5">Max (minutos):</span>
              <input
                type="number"
                min="0"
                placeholder="Ex: 60"
                value={filters.duracaoMaxMinutos}
                onChange={(e) => onFilterChange({ ...filters, duracaoMaxMinutos: e.target.value })}
                className="w-full text-xs font-mono px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-red-500"
              />
            </div>
          </div>
        </div>

        {/* b) Filtro de Severidade */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Severidade
          </label>
          <div className="space-y-1">
            {SEVERITY_ORDER.map((sev) => {
              const checked = filters.severidades.includes(sev);
              const color = SEVERITY_COLORS[sev] || '#757575';
              const count = severityCounts[sev] || 0;
              return (
                <button
                  type="button"
                  key={sev}
                  onClick={() => handleSeverityToggle(sev)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                    checked
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span>{sev}</span>
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400">
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* e) Filtro de Status */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Status do Incidente
          </label>
          <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
            {(['Todos', 'RESOLVIDO', 'INCIDENTE'] as const).map((st) => (
              <button
                type="button"
                key={st}
                onClick={() => onFilterChange({ ...filters, status: st })}
                className={`py-1 text-center font-medium rounded-md transition-colors cursor-pointer ${
                  filters.status === st
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {st === 'Todos' ? 'Todos' : st === 'RESOLVIDO' ? 'Resolvido' : 'Aberto'}
              </button>
            ))}
          </div>
        </div>

        {/* f) Filtro de Reconhecido */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Reconhecido (Ack)
          </label>
          <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
            {(['Todos', 'Sim', 'Não'] as const).map((rec) => (
              <button
                type="button"
                key={rec}
                onClick={() => onFilterChange({ ...filters, reconhecido: rec })}
                className={`py-1 text-center font-medium rounded-md transition-colors cursor-pointer ${
                  filters.reconhecido === rec
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {rec}
              </button>
            ))}
          </div>
        </div>

        {/* c) Filtro de Host (Searchable Multi-Select) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Host ({filters.hosts.length ? `${filters.hosts.length} sel.` : 'Todos'})
            </label>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, hosts: hostList.map((h) => h.host) })}
                className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                Todos
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, hosts: [] })}
                className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                Limpar
              </button>
            </div>
          </div>
          <div className="relative mb-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Buscar host..."
              value={hostSearch}
              onChange={(e) => setHostSearch(e.target.value)}
              className="w-full text-xs pl-8 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-red-500"
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5 border border-slate-100 dark:border-slate-800 rounded-md p-1">
            {filteredHostList.map(({ host, count }) => {
              const checked = filters.hosts.includes(host);
              return (
                <button
                  type="button"
                  key={host}
                  onClick={() => handleHostToggle(host)}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs text-left cursor-pointer transition-colors ${
                    checked
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate pr-2 font-mono text-[11px]">{host}</span>
                  <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
                    {count}
                  </span>
                </button>
              );
            })}
            {filteredHostList.length === 0 && (
              <div className="py-2 text-center text-[11px] text-slate-400">Nenhum host encontrado</div>
            )}
          </div>
        </div>

        {/* d) Filtro de Trigger / Incidente (Searchable Multi-Select) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Trigger ({filters.triggers.length ? `${filters.triggers.length} sel.` : 'Todas'})
            </label>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, triggers: triggerList.map((t) => t.trigger) })}
                className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                Todas
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, triggers: [] })}
                className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                Limpar
              </button>
            </div>
          </div>
          <div className="relative mb-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Buscar trigger..."
              value={triggerSearch}
              onChange={(e) => setTriggerSearch(e.target.value)}
              className="w-full text-xs pl-8 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-red-500"
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5 border border-slate-100 dark:border-slate-800 rounded-md p-1">
            {filteredTriggerList.map(({ trigger, count }) => {
              const checked = filters.triggers.includes(trigger);
              return (
                <button
                  type="button"
                  key={trigger}
                  onClick={() => handleTriggerToggle(trigger)}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs text-left cursor-pointer transition-colors ${
                    checked
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  title={trigger}
                >
                  <span className="truncate pr-2">{trigger}</span>
                  <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
                    {count}
                  </span>
                </button>
              );
            })}
            {filteredTriggerList.length === 0 && (
              <div className="py-2 text-center text-[11px] text-slate-400">Nenhuma trigger encontrada</div>
            )}
          </div>
        </div>

        {/* g) Filtro por Etiquetas (Tags) */}
        {uniqueTagKeys.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <span>Etiquetas (Tags)</span>
            </label>
            <select
              value={filters.tagKey}
              onChange={(e) => onFilterChange({ ...filters, tagKey: e.target.value, tagValues: [] })}
              className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 mb-1.5 focus:outline-hidden focus:border-red-500"
            >
              <option value="">Todas as chaves de etiqueta</option>
              {uniqueTagKeys.map((k) => (
                <option key={k} value={k}>
                  Chave: {k}
                </option>
              ))}
            </select>

            {filters.tagKey && tagValuesForSelectedKey.length > 0 && (
              <div className="max-h-28 overflow-y-auto space-y-0.5 border border-slate-100 dark:border-slate-800 rounded-md p-1">
                {tagValuesForSelectedKey.map((val) => {
                  const checked = filters.tagValues.includes(val);
                  return (
                    <button
                      type="button"
                      key={val}
                      onClick={() => handleTagValueToggle(val)}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs text-left cursor-pointer transition-colors ${
                        checked
                          ? 'bg-slate-200 dark:bg-slate-700 font-medium text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{val || '(vazio)'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
