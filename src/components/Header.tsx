import React, { useState } from 'react';
import {
  Upload,
  Sun,
  Moon,
  SlidersHorizontal,
  RotateCcw,
  FolderArchive,
  FileDown,
  Building2,
  Settings,
  FileText,
  LogOut,
  User,
  ChevronDown,
  Sparkles,
  Wrench,
  ShieldCheck,
  Presentation,
} from 'lucide-react';
import { SaaSClient, SaaSUser } from '../utils/saasDB';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenUpload: () => void;
  onOpenChartConfig: () => void;
  onOpenSessions: () => void;
  onOpenReportModal: () => void;
  onOpenPresentationModal?: () => void;
  onOpenValidator?: () => void;
  onResetFilters: () => void;
  hasData: boolean;
  totalFiltered: number;
  totalRaw: number;
  savedSessionsCount: number;
  // SaaS props
  currentUser?: SaaSUser | null;
  clients?: SaaSClient[];
  selectedClientId?: string;
  onSelectClient?: (clientId: string) => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onOpenUpload,
  onOpenChartConfig,
  onOpenSessions,
  onOpenReportModal,
  onOpenPresentationModal,
  onOpenValidator,
  onResetFilters,
  hasData,
  totalFiltered,
  totalRaw,
  savedSessionsCount,
  currentUser,
  clients = [],
  selectedClientId = '',
  onSelectClient,
  onNavigate,
  onLogout,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  return (
    <header className="solor-topbar sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">Dashboard</p>

      {/* Zona 2: Contexto do Cliente Selecionado & Status */}
      <div className="flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
        {clients.length > 0 && onSelectClient && (
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedClientId}
              onChange={(e) => onSelectClient(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
            >
              <option value="">Todos os Clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id} className="dark:bg-slate-900">
                  {c.name}
                </option>
              ))}
            </select>
            {(() => {
              const activeClient = clients.find((c) => c.id === selectedClientId);
              return activeClient?.triggerCatalog ? (
                <span
                  className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono"
                  title={`Catálogo de Triggers vinculado: ${activeClient.triggerCatalog.fileName} (${activeClient.triggerCatalog.totalTriggers} triggers)`}
                >
                  fx: {activeClient.triggerCatalog.totalTriggers}
                </span>
              ) : null;
            })()}
          </div>
        )}

        {hasData && (
          <div className="hidden lg:flex items-center gap-2">
            <span>Relatório ativo</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
            <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {totalFiltered} de {totalRaw} eventos
            </span>
          </div>
        )}
      </div>

      {/* Zona 3: Ações do Dashboard & Perfil */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Botão de Histórico de Sessões Salvas */}
        <button
          onClick={onOpenSessions}
          title="Ver relatórios salvos localmente no navegador"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
              onClick={onOpenReportModal}
              title="Gerar Relatório Técnico em PDF (Padrão Tuning de Triggers)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-100 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">Relatório PDF</span>
            </button>
            {onOpenPresentationModal && (
              <button
                onClick={onOpenPresentationModal}
                title="Exportar Apresentação em PowerPoint Widescreen 16:9 (*.pptx)"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 dark:text-blue-100 bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-300 dark:border-blue-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Presentation className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">Apresentação PPTX</span>
              </button>
            )}

            <button
              onClick={onResetFilters}
              title="Redefinir todos os filtros aplicados"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Limpar Filtros</span>
            </button>

            <button
              onClick={onOpenChartConfig}
              title="Personalizar e reordenar gráficos"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gráficos</span>
            </button>
          </>
        )}

        {onNavigate && (
          <button
            onClick={() => onNavigate('#/trigger-factory')}
            title="Abrir Fábrica de Triggers e Otimizador de Expressões Zabbix 7.0"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Fábrica de Triggers</span>
          </button>
        )}

        {onOpenValidator && (
          <button
            onClick={onOpenValidator}
            title="Validador de Sintaxe Zabbix 7.0 & Histerese Anti-flapping"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-800 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden xl:inline">Validador Zabbix</span>
          </button>
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
          aria-label={hasData ? 'Novo Arquivo' : 'Carregar Excel'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{hasData ? 'Novo Arquivo' : 'Carregar Excel'}</span>
        </button>

        {/* Menu do Usuário */}
        {currentUser && (
          <div className="relative ml-1">
            <button
              type="button"
              aria-label="Menu do usuário"
              aria-expanded={isUserMenuOpen}
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                {currentUser.name ? currentUser.name.slice(0, 1).toUpperCase() : 'U'}
              </span>
              <span className="hidden md:inline max-w-[100px] truncate">{currentUser.name.split(' ')[0]}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-2 z-50 text-xs animate-in fade-in slide-in-from-top-2">
                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</div>
                  <div className="font-mono text-[10px] text-slate-400 truncate">{currentUser.email}</div>
                  <span className="inline-block mt-1 text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                    {currentUser.role}
                  </span>
                </div>

                {onNavigate && (
                  <>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('#/clients');
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Clientes</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('#/reports');
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Histórico Relatórios</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('#/trigger-factory');
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5 text-blue-500" />
                      <span>Fábrica de Triggers</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('#/settings');
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Configurações</span>
                    </button>
                  </>
                )}

                {onLogout && (
                  <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 cursor-pointer font-semibold"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sair da Conta</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
