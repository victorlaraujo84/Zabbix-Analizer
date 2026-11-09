/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ZabbixEvent, ZabbixFilters, ChartItemConfig, SavedSession } from './types/zabbix';
import { getSampleZabbixEvents } from './data/sampleData';
import {
  filterEvents,
  computeKPIs,
  computeComparativeMetrics,
  generateExecutiveSummary,
  generateTriggerTuningPrompt,
  generateExecutiveReportPrompt,
} from './utils/analytics';
import { calculateTrendsComparison } from './utils/trends';
import { toDateTimeLocalString } from './utils/parser';
import {
  saveActiveReport,
  loadActiveReport,
  clearActiveReport,
  getSavedSessions,
  saveSessionToHistory,
  deleteSessionFromHistory,
} from './utils/storage';
import {
  initializeSaaSDB,
  getCurrentUser,
  getActiveCompany,
  getClients,
  logoutUser,
  getActiveTriggerCatalog,
  SaaSUser,
  SaaSCompany,
  SaaSClient,
} from './utils/saasDB';
import { Header } from './components/Header';
import { SolorLayout } from './components/SolorLayout';
import { UploadZone } from './components/UploadZone';
import { KPICards } from './components/KPICards';
import { ExecutiveSummary } from './components/ExecutiveSummary';
import { FilterPanel } from './components/FilterPanel';
import { ChartsGrid } from './components/ChartsGrid';
import { TrendsView } from './components/TrendsView';
import { EventsTable } from './components/EventsTable';
import { PromptModal } from './components/PromptModal';
import { SessionsModal } from './components/SessionsModal';
import { ReportModal } from './components/ReportModal';
import { PresentationModal } from './components/PresentationModal';
import { DeepSeekPanel } from './components/DeepSeekPanel';
import { ClientsView } from './components/ClientsView';
import { SettingsView } from './components/SettingsView';
import { ReportsView } from './components/ReportsView';
import { TriggerFactoryView } from './components/TriggerFactoryView';
import { AuthView } from './components/AuthView';
import { ZabbixSyntaxValidatorModal } from './components/ZabbixSyntaxValidatorModal';
import { X, CheckCircle2, LayoutDashboard, TrendingUp } from 'lucide-react';

const DEFAULT_CHART_CONFIGS: ChartItemConfig[] = [
  {
    id: 'chart-timeline',
    title: 'Linha do Tempo de Incidentes',
    description: 'Eventos agrupados por período com detecção de anomalias (+2σ)',
    visible: true,
  },
  {
    id: 'chart-severity',
    title: 'Distribuição por Severidade',
    description: 'Proporção de eventos classificados por criticidade',
    visible: true,
  },
  {
    id: 'chart-hosts',
    title: 'Top 10 Hosts Mais Afetados',
    description: 'Servidores com maior volume de alarmes (clique para filtrar)',
    visible: true,
  },
  {
    id: 'chart-triggers',
    title: 'Top 10 Triggers Mais Frequentes',
    description: 'Alarmes com maior incidência na infraestrutura',
    visible: true,
  },
  {
    id: 'chart-status',
    title: 'Status dos Incidentes',
    description: 'Proporção entre alarmes resolvidos e em aberto',
    visible: true,
  },
  {
    id: 'chart-duration',
    title: 'Duração Média por Severidade',
    description: 'Tempo médio de duração em minutos por faixa de criticidade',
    visible: true,
  },
  {
    id: 'chart-hours',
    title: 'Incidentes por Hora do Dia',
    description: 'Distribuição horária (00h às 23h) para detecção de janelas de pico',
    visible: true,
  },
  {
    id: 'chart-evolution',
    title: 'Evolução de Incidentes em Aberto',
    description: 'Acúmulo temporal de backlog de incidentes ativos',
    visible: true,
  },
];

const INITIAL_FILTERS: ZabbixFilters = {
  dateFrom: '',
  dateTo: '',
  severidades: [],
  hosts: [],
  triggers: [],
  status: 'Todos',
  reconhecido: 'Todos',
  tagKey: '',
  tagValues: [],
  searchQuery: '',
  duracaoPreset: 'all',
  duracaoMinMinutos: '',
  duracaoMaxMinutos: '',
  zabbixFunction: 'todas',
  expressionQuery: '',
};

export default function App() {
  // Tema escuro/claro respeitando preferência do sistema com persistência local
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('zabbix_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  // SaaS Multi-tenant & Roteamento por Hash
  const [route, setRoute] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      return window.location.hash;
    }
    return '#/app';
  });

  const [currentUser, setCurrentUser] = useState<SaaSUser | null>(() => getCurrentUser());
  const [company, setCompany] = useState<SaaSCompany>(() => getActiveCompany());
  const [clients, setClients] = useState<SaaSClient[]>(() => getClients());
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  // Inicializa banco SaaS com seed seguro se necessário
  useEffect(() => {
    initializeSaaSDB().then(() => {
      setCurrentUser(getCurrentUser());
      setCompany(getActiveCompany());
      setClients(getClients());
    });
  }, []);

  // Monitora alterações na hash da URL
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash || '#/app');
      // Atualiza dados SaaS que possam ter sido alterados em telas de configurações
      setCompany(getActiveCompany());
      setClients(getClients());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (newRoute: string) => {
    window.location.hash = newRoute;
    setRoute(newRoute);
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    navigateTo('#/login');
  };

  const handleAuthSuccess = (user: SaaSUser) => {
    setCurrentUser(user);
    setCompany(getActiveCompany());
    setClients(getClients());
    navigateTo('#/app');
  };

  // Alternador de visão: Dashboard vs Visão de Tendências (Trends)
  const [activeView, setActiveView] = useState<'dashboard' | 'trends'>('dashboard');

  // Tenta restaurar sessão ativa persistida automaticamente
  const initialSavedReport = useMemo(() => loadActiveReport(), []);

  // Estado dos dados brutos e filtros
  const [rawEvents, setRawEvents] = useState<ZabbixEvent[]>(() => {
    return initialSavedReport ? initialSavedReport.events : [];
  });

  const [activeFileName, setActiveFileName] = useState<string | null>(() => {
    return initialSavedReport ? initialSavedReport.filename : null;
  });

  const [filters, setFilters] = useState<ZabbixFilters>(INITIAL_FILTERS);
  const [notification, setNotification] = useState<string | null>(null);

  // Lista de sessões salvas no histórico
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() => getSavedSessions());

  // Configuração e visibilidade de gráficos
  const [chartConfigs, setChartConfigs] = useState<ChartItemConfig[]>(() => {
    try {
      const saved = localStorage.getItem('zabbix_chart_configs');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignora erro
    }
    return DEFAULT_CHART_CONFIGS;
  });

  // Estados dos modais
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isChartConfigOpen, setIsChartConfigOpen] = useState(false);
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);
  const [isTuningPromptOpen, setIsTuningPromptOpen] = useState(false);
  const [isExecutivePromptOpen, setIsExecutivePromptOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isPresentationModalOpen, setIsPresentationModalOpen] = useState(false);
  const [activeAiNarrative, setActiveAiNarrative] = useState<string | undefined>(undefined);

  // Estados do Validador de Sintaxe Zabbix 7.0 & Histerese (Fase 3)
  const [isValidatorModalOpen, setIsValidatorModalOpen] = useState(false);
  const [validatorProblemExpr, setValidatorProblemExpr] = useState('');
  const [validatorRecoveryExpr, setValidatorRecoveryExpr] = useState('');
  const [validatorTriggerName, setValidatorTriggerName] = useState('');
  const [validatorHostName, setValidatorHostName] = useState('');

  const handleOpenValidator = (
    problemExpr: string = '',
    recoveryExpr: string = '',
    triggerName: string = '',
    hostName: string = ''
  ) => {
    setValidatorProblemExpr(problemExpr);
    setValidatorRecoveryExpr(recoveryExpr);
    setValidatorTriggerName(triggerName);
    setValidatorHostName(hostName);
    setIsValidatorModalOpen(true);
  };

  // Aplica classe .dark no HTML element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('zabbix_theme', theme);
  }, [theme]);

  // Se restaurou dados na montagem, inicializa os limites de datas dos filtros
  useEffect(() => {
    if (initialSavedReport && initialSavedReport.events.length > 0) {
      resetFiltersToData(initialSavedReport.events);
    }
  }, []);

  // Salva preferências de gráficos
  const handleUpdateChartConfigs = (configs: ChartItemConfig[]) => {
    setChartConfigs(configs);
    try {
      localStorage.setItem('zabbix_chart_configs', JSON.stringify(configs));
    } catch {
      // Ignora erro
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Carregamento de novos dados via Excel
  const handleDataLoaded = (events: ZabbixEvent[], filename: string) => {
    setRawEvents(events);
    setActiveFileName(filename);
    resetFiltersToData(events);

    // Persiste automaticamente no navegador e histórico
    saveActiveReport(filename, events);
    saveSessionToHistory(filename, events);
    setSavedSessions(getSavedSessions());

    showToast(`Relatório "${filename}" carregado e salvo automaticamente (${events.length} incidentes).`);
  };

  // Carregamento de dados de exemplo embutidos
  const handleLoadSample = () => {
    const sample = getSampleZabbixEvents();
    const filename = 'relatorio_zabbix_producao_exemplo.xlsx';
    setRawEvents(sample);
    setActiveFileName(filename);
    resetFiltersToData(sample);

    // Persiste automaticamente no navegador e histórico
    saveActiveReport(filename, sample);
    saveSessionToHistory(filename, sample);
    setSavedSessions(getSavedSessions());

    showToast('24 incidentes de exemplo carregados e salvos localmente.');
  };

  // Carregar sessão do histórico
  const handleSelectSession = (session: SavedSession) => {
    setRawEvents(session.events);
    setActiveFileName(session.name);
    resetFiltersToData(session.events);
    saveActiveReport(session.name, session.events);
    showToast(`Sessão "${session.name}" restaurada.`);
  };

  const handleDeleteSession = (id: string) => {
    const updated = deleteSessionFromHistory(id);
    setSavedSessions(updated);
    showToast('Relatório removido do histórico.');
  };

  const handleClearAllSessions = () => {
    localStorage.removeItem('zabbix_saved_sessions');
    clearActiveReport();
    setSavedSessions([]);
    setRawEvents([]);
    setActiveFileName(null);
    setIsSessionsModalOpen(false);
    showToast('Histórico e relatórios limpos do navegador.');
  };

  const resetFiltersToData = (events: ZabbixEvent[]) => {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const e of events) {
      if (e.dataInicio) {
        if (!min || e.dataInicio < min) min = e.dataInicio;
        if (!max || e.dataInicio > max) max = e.dataInicio;
      }
    }

    setFilters({
      ...INITIAL_FILTERS,
      dateFrom: min ? toDateTimeLocalString(min) : '',
      dateTo: max ? toDateTimeLocalString(max) : '',
    });
  };

  const handleResetFilters = () => {
    resetFiltersToData(rawEvents);
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4500);
  };

  // Dados filtrados reativamente
  const filteredEvents = useMemo(() => {
    return filterEvents(rawEvents, filters);
  }, [rawEvents, filters]);

  // KPIs calculados sobre os dados filtrados
  const kpis = useMemo(() => {
    return computeKPIs(filteredEvents, filters);
  }, [filteredEvents, filters]);

  // Métricas comparativas de período (MTTR, MTBF, Volumetria lado a lado)
  const comparativeMetrics = useMemo(() => {
    return computeComparativeMetrics(rawEvents, filters);
  }, [rawEvents, filters]);

  // Comparativo de tendências (Período atual vs Período anterior equivalente)
  const trendsComparison = useMemo(() => {
    return calculateTrendsComparison(rawEvents, filteredEvents, filters);
  }, [rawEvents, filteredEvents, filters]);

  // Resumo executivo automatizado
  const executiveInsights = useMemo(() => {
    return generateExecutiveSummary(filteredEvents, kpis);
  }, [filteredEvents, kpis]);

  // Prompts gerados dinamicamente seguindo rigorosamente os filtros selecionados
  // Cliente atualmente selecionado para escopo
  const selectedClient = useMemo(() => {
    if (!selectedClientId) return undefined;
    return clients.find((c) => c.id === selectedClientId);
  }, [clients, selectedClientId]);

  // Catálogo de Triggers & Expressões vinculado ao cliente selecionado ou global
  const activeTriggerCatalog = useMemo(() => {
    return getActiveTriggerCatalog(selectedClientId);
  }, [selectedClientId, clients]);

  const triggerTuningPrompt = useMemo(() => {
    return generateTriggerTuningPrompt(filteredEvents, kpis, filters, rawEvents.length, activeTriggerCatalog);
  }, [filteredEvents, kpis, filters, rawEvents.length, activeTriggerCatalog]);

  const executiveReportPrompt = useMemo(() => {
    return generateExecutiveReportPrompt(filteredEvents, kpis, filters, rawEvents.length);
  }, [filteredEvents, kpis, filters, rawEvents.length]);

  // Atalho ao clicar em um Host específico
  const handleFilterHost = (hostInput: any) => {
    const cleanHost = typeof hostInput === 'object' && hostInput !== null
      ? (hostInput.host || String(hostInput))
      : String(hostInput || '');
    if (!cleanHost || cleanHost === 'Nenhum') return;
    setFilters((prev) => ({
      ...prev,
      hosts: [cleanHost],
    }));
  };

  // Atalho ao clicar em uma Trigger específica
  const handleFilterTrigger = (triggerInput: any) => {
    const cleanTrigger = typeof triggerInput === 'object' && triggerInput !== null
      ? (triggerInput.trigger || triggerInput.name || String(triggerInput))
      : String(triggerInput || '');
    if (!cleanTrigger || cleanTrigger === 'Nenhuma') return;
    setFilters((prev) => ({
      ...prev,
      triggers: [cleanTrigger],
    }));
  };

  // ROTEAMENTO SAAS:
  // Se usuário não estiver logado, exibe tela de login/signup
  if (!currentUser) {
    const isSignup = route === '#/signup';
    return (
      <AuthView
        initialMode={isSignup ? 'signup' : 'login'}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  const renderWorkspace = (content: React.ReactNode) => (
    <SolorLayout route={route} companyName={company?.name || 'Zabbix Analyzer'} logo={company?.logoDataUrl}>
      {content}
    </SolorLayout>
  );

  // Visualização de Clientes (#/clients)
  if (route === '#/clients') {
    return renderWorkspace(
      <ClientsView
        onBackToApp={() => navigateTo('#/app')}
        onSelectClientForAnalysis={(c) => {
          setSelectedClientId(c.id);
          navigateTo('#/app');
        }}
      />
    );
  }

  // Visualização de Configurações (#/settings)
  if (route === '#/settings') {
    return renderWorkspace(
      <SettingsView
        onBackToApp={() => navigateTo('#/app')}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  // Visualização de Histórico de Relatórios (#/reports)
  if (route === '#/reports') {
    return renderWorkspace(<ReportsView onBackToApp={() => navigateTo('#/app')} />);
  }

  // Visualização da Fábrica de Triggers (#/trigger-factory)
  if (route === '#/trigger-factory') {
    return renderWorkspace(
      <TriggerFactoryView
        onBackToApp={() => navigateTo('#/app')}
        clients={clients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        events={filteredEvents}
        kpis={kpis}
        onOpenValidator={(p, r, t, h) => handleOpenValidator(p, r, t, h)}
      />
    );
  }



  // TELA PRINCIPAL (DASHBOARD CORE: #/app ou raiz)
  return renderWorkspace(
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Barra de Navegação Top Bar com White-label, Seletor de Clientes e Roteamento */}
      <Header
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onOpenChartConfig={() => setIsChartConfigOpen(true)}
        onOpenSessions={() => setIsSessionsModalOpen(true)}
        onOpenReportModal={() => {
          setActiveAiNarrative(undefined);
          setIsReportModalOpen(true);
        }}
        onOpenPresentationModal={() => setIsPresentationModalOpen(true)}
        onOpenValidator={() => handleOpenValidator()}
        onResetFilters={handleResetFilters}
        hasData={rawEvents.length > 0}
        totalFiltered={filteredEvents.length}
        totalRaw={rawEvents.length}
        savedSessionsCount={savedSessions.length}
        currentUser={currentUser}
        clients={clients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        onNavigate={navigateTo}
        onLogout={handleLogout}
      />

      {/* Toast de Notificação */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-lg text-xs font-medium animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{notification}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 text-slate-400 hover:text-white dark:hover:text-slate-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Zero State / Tela Inicial quando nenhum arquivo foi carregado ainda */}
      {rawEvents.length === 0 ? (
        <main className="container mx-auto px-4 py-8">
          <section className="solor-welcome" aria-labelledby="welcome-title">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider">Observabilidade e tuning</p>
            <h1 id="welcome-title" className="mb-2 text-3xl font-semibold">Análise de eventos Zabbix</h1>
            <p className="mb-5 max-w-xl text-sm">Importe um relatório para analisar incidentes, acompanhar tendências e avaliar triggers.</p>
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              Importar relatório
            </button>
          </section>
          <UploadZone
            onDataLoaded={handleDataLoaded}
            onLoadSample={handleLoadSample}
          />
        </main>
      ) : (
        /* Dashboard Principal com Filtros, KPIs, Gráficos e Tabela (Núcleo 100% Preservado) */
        <main className="p-4 lg:p-6 max-w-[1720px] mx-auto">
          {/* Painel de Diagnóstico Inteligente com DeepSeek AI */}
          <DeepSeekPanel
            events={filteredEvents}
            kpis={kpis}
            filters={filters}
            clientName={selectedClient?.name}
            triggerCatalog={activeTriggerCatalog}
            onOpenReportModal={(narrative) => {
              setActiveAiNarrative(narrative);
              setIsReportModalOpen(true);
            }}
            onOpenSettings={() => navigateTo('#/settings')}
          />

          {/* Resumo Executivo com 3 Conclusões e Botões de Prompt IA */}
          <ExecutiveSummary
            insights={executiveInsights}
            onOpenTuningPrompt={() => setIsTuningPromptOpen(true)}
            onOpenExecutivePrompt={() => setIsExecutivePromptOpen(true)}
            onOpenReportModal={() => {
              setActiveAiNarrative(undefined);
              setIsReportModalOpen(true);
            }}
            onOpenPresentationModal={() => setIsPresentationModalOpen(true)}
          />

          {/* Faixa de 8 Cards de KPIs incluindo MTBF e Taxa de Atuação */}
          <KPICards
            kpis={kpis}
            comparativeMetrics={comparativeMetrics}
            onSelectHost={handleFilterHost}
            onSelectTrigger={handleFilterTrigger}
          />

          {/* Seletor de Visão Principal: Dashboard vs Visão de Tendências (Trends) */}
          <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeView === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Painel de Operações &amp; Gráficos</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('trends')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeView === 'trends'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Visão de Tendências (Trends)</span>
              {trendsComparison.volumeDeltaPct !== 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    trendsComparison.volumeDeltaCount > 0
                      ? 'bg-red-500 text-white'
                      : 'bg-emerald-500 text-white'
                  }`}
                >
                  {trendsComparison.volumeDeltaPct > 0 ? `+${trendsComparison.volumeDeltaPct}%` : `${trendsComparison.volumeDeltaPct}%`}
                </span>
              )}
            </button>
          </div>

          {/* Layout Principal: Sidebar de Filtros + Conteúdo Analítico */}
          <div className="grid grid-cols-1 min-[1250px]:grid-cols-12 gap-6 items-start">
            {/* Sidebar Lateral de Filtros (3 colunas em telas grandes) */}
            <div className="min-w-0 min-[1250px]:col-span-3">
              <FilterPanel
                rawEvents={rawEvents}
                filteredEvents={filteredEvents}
                filters={filters}
                onFilterChange={setFilters}
                onResetFilters={handleResetFilters}
              />
            </div>

            {/* Conteúdo Central: Alterna entre Dashboard e Visão de Tendências */}
            <div className="min-w-0 min-[1250px]:col-span-9 space-y-6">
              {activeView === 'trends' ? (
                /* Visão de Tendências (Trends) comparando período atual vs anterior */
                <TrendsView comparison={trendsComparison} />
              ) : (
                /* Visão Padrão: Grid de 8 Gráficos + Tabela Detalhada */
                <>
                  <ChartsGrid
                    events={filteredEvents}
                    theme={theme}
                    onFilterHost={handleFilterHost}
                    chartConfigs={chartConfigs}
                    onUpdateChartConfigs={handleUpdateChartConfigs}
                    isConfigOpen={isChartConfigOpen}
                    onCloseConfig={() => setIsChartConfigOpen(false)}
                  />

                  <EventsTable
                    events={filteredEvents}
                    totalRaw={rawEvents.length}
                    triggerCatalog={activeTriggerCatalog}
                    onValidateExpression={(expr, triggerName, hostName) =>
                      handleOpenValidator(expr, '', triggerName, hostName)
                    }
                    clientName={selectedClient?.name}
                    companyName={company?.name}
                    activeFilters={filters}
                  />
                </>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Modal de Upload de Novo Arquivo */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <button
              onClick={() => setIsUploadModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <UploadZone
              isModal
              onCloseModal={() => setIsUploadModalOpen(false)}
              onDataLoaded={handleDataLoaded}
              onLoadSample={handleLoadSample}
            />
          </div>
        </div>
      )}

      {/* Modal de Histórico de Sessões Salvas */}
      <SessionsModal
        isOpen={isSessionsModalOpen}
        onClose={() => setIsSessionsModalOpen(false)}
        sessions={savedSessions}
        activeSessionName={activeFileName}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onClearAll={handleClearAllSessions}
      />

      {/* Modal do Prompt de Tuning de Triggers / Ruído Operacional */}
      <PromptModal
        isOpen={isTuningPromptOpen}
        onClose={() => setIsTuningPromptOpen(false)}
        title="Prompt de Tuning de Triggers Zabbix"
        subtitle="Prompt estruturado com triggers de flapping e ruído operacional adaptado aos filtros ativos"
        promptText={triggerTuningPrompt}
        badgeLabel="Combate ao Ruído"
        iconType="tuning"
        filteredCount={filteredEvents.length}
        totalCount={rawEvents.length}
      />

      {/* Modal do Prompt para Relatório Executivo Formal */}
      <PromptModal
        isOpen={isExecutivePromptOpen}
        onClose={() => setIsExecutivePromptOpen(false)}
        title="Prompt para Relatório Executivo Formal"
        subtitle="Consolidação de MTTR, MTBF, taxa de atuação e pontos críticos adaptado aos filtros ativos"
        promptText={executiveReportPrompt}
        badgeLabel="Governança & SLA"
        iconType="executive"
        filteredCount={filteredEvents.length}
        totalCount={rawEvents.length}
      />

      {/* Modal de Geração de Relatório Técnico em PDF com White-label e Histórico */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        events={filteredEvents}
        kpis={kpis}
        activeFilters={filters}
        filename={activeFileName}
        initialAiNarrative={activeAiNarrative}
        defaultClientName={selectedClient?.name}
        triggerCatalog={activeTriggerCatalog}
        onValidateExpression={(p, r, t, h) => handleOpenValidator(p, r, t, h)}
      />

      {/* Modal de Exportação de Apresentação em PowerPoint (*.pptx) Widescreen 16:9 */}
      <PresentationModal
        isOpen={isPresentationModalOpen}
        onClose={() => setIsPresentationModalOpen(false)}
        events={filteredEvents}
        kpis={kpis}
        activeFilters={filters}
        defaultClientName={selectedClient?.name}
        initialAiNarrative={activeAiNarrative}
        companyName={company?.name}
      />

      {/* Modal Validador de Sintaxe Zabbix 7.0 & Histerese Anti-flapping (Fase 3) */}
      <ZabbixSyntaxValidatorModal
        isOpen={isValidatorModalOpen}
        onClose={() => setIsValidatorModalOpen(false)}
        initialProblemExpression={validatorProblemExpr}
        initialRecoveryExpression={validatorRecoveryExpr}
        triggerName={validatorTriggerName}
        hostName={validatorHostName}
      />
    </div>
  );
}
