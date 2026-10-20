import React from 'react';
import { Upload, Sun, Moon, SlidersHorizontal, BarChart3, RotateCcw, FolderArchive } from 'lucide-react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenUpload: () => void;
  onOpenChartConfig: () => void;
  onOpenSessions: () => void;
  onResetFilters: () => void;
  hasData: boolean;
  totalFiltered: number;
  totalRaw: number;
  savedSessionsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onOpenUpload,
  onOpenChartConfig,
  onOpenSessions,
  onResetFilters,
  hasData,
  totalFiltered,
  totalRaw,
  savedSessionsCount,
}) => {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-6 py-3.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold shadow-xs">
          <BarChart3 className="w-4 h-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Zabbix Analyzer
          </span>
          <span className="hidden sm:inline-block text-xs font-medium text-slate-400 dark:text-slate-500">
            Analytics &amp; MTTR
          </span>
        </div>
      </div>

      {/* Zone 2: Informational / Contextual status */}
      <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
        {hasData && (
          <div className="flex items-center gap-2">
            <span>Relatório ativo</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
            <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {totalFiltered} de {totalRaw} eventos
            </span>
          </div>
        )}
      </div>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Botão de Histórico de Sessões Salvas */}
        <button
          onClick={onOpenSessions}
          title="Ver relatórios salvos localmente no navegador"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <FolderArchive className="w-3.5 h-3.5 text-purple-500" />
          <span className="hidden sm:inline">Salvos</span>
          {savedSessionsCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-[10px] font-bold flex items-center justify-center font-mono">
              {savedSessionsCount}
            </span>
          )}
        </button>

        {hasData && (
          <>
            <button
              onClick={onResetFilters}
              title="Redefinir todos os filtros aplicados"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Limpar Filtros</span>
            </button>

            <button
              onClick={onOpenChartConfig}
              title="Personalizar e reordenar gráficos"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gráficos</span>
            </button>
          </>
        )}

        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Alternar tema visual"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{hasData ? 'Novo Arquivo' : 'Carregar Excel'}</span>
        </button>
      </div>
    </header>
  );
};
