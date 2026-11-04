import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Copy,
  CheckCheck,
  Save,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileCode,
  Layers,
  Info,
  Building2,
  Download,
  Code2,
  ArrowRight,
  Sliders,
  Database,
  Cpu,
  HardDrive,
  Activity,
  Network,
  Server,
  Zap,
} from 'lucide-react';
import {
  SaaSClient,
  saveClientTriggerCatalog,
  getClientTriggerCatalog,
  getActiveTriggerCatalog,
  saveCompanyGlobalTriggerCatalog,
  getCompanyGlobalTriggerCatalog,
} from '../utils/saasDB';
import { ZabbixEvent, ZabbixKPIs, ZabbixTriggerCatalogItem, ClientTriggerCatalog } from '../types/zabbix';

interface TriggerFactoryViewProps {
  onBackToApp: () => void;
  clients: SaaSClient[];
  selectedClientId: string;
  onSelectClient: (clientId: string) => void;
  events?: ZabbixEvent[];
  kpis?: ZabbixKPIs;
  onOpenValidator?: (problemExpr: string, recoveryExpr: string, triggerName: string, hostName: string) => void;
}

interface MetricPreset {
  id: string;
  label: string;
  icon: React.ReactNode;
  itemKey: string;
  problemFunc: string;
  problemWindow: string;
  problemOp: string;
  problemThreshold: string;
  recoveryFunc: string;
  recoveryWindow: string;
  recoveryOp: string;
  recoveryThreshold: string;
  severity: 'Informação' | 'Aviso' | 'Médio' | 'Alto' | 'Desastre';
  description: string;
  suggestedTags: { tag: string; value: string }[];
}

const OFFICIAL_PRESETS: MetricPreset[] = [
  {
    id: 'cpu_saturation',
    label: 'CPU — Sobrecarga com Histerese (90% / 70%)',
    icon: <Cpu className="w-4 h-4 text-red-500" />,
    itemKey: 'system.cpu.util',
    problemFunc: 'min',
    problemWindow: '5m',
    problemOp: '>',
    problemThreshold: '90',
    recoveryFunc: 'max',
    recoveryWindow: '10m',
    recoveryOp: '<',
    recoveryThreshold: '70',
    severity: 'Alto',
    description: 'Evita alertas por picos efêmeros e previne reabertura oscilante enquanto a CPU não estabilizar abaixo de 70%.',
    suggestedTags: [
      { tag: 'scope', value: 'performance' },
      { tag: 'component', value: 'cpu' },
      { tag: 'hysteresis', value: 'active' },
    ],
  },
  {
    id: 'memory_pavailable',
    label: 'Memória RAM — Esgotamento com Janela de Respiro',
    icon: <Database className="w-4 h-4 text-amber-500" />,
    itemKey: 'vm.memory.size[pavailable]',
    problemFunc: 'min',
    problemWindow: '5m',
    problemOp: '<',
    problemThreshold: '10',
    recoveryFunc: 'min',
    recoveryWindow: '10m',
    recoveryOp: '>',
    recoveryThreshold: '20',
    severity: 'Alto',
    description: 'Dispara quando a memória disponível ficar abaixo de 10% por 5 min e só normaliza quando subir além de 20% por 10 min.',
    suggestedTags: [
      { tag: 'scope', value: 'capacity' },
      { tag: 'component', value: 'memory' },
      { tag: 'tier', value: 'os' },
    ],
  },
  {
    id: 'icmp_ping',
    label: 'Conectividade ICMP — Queda de Link sem Falsos Positivos',
    icon: <Activity className="w-4 h-4 text-rose-500" />,
    itemKey: 'icmpping',
    problemFunc: 'max',
    problemWindow: '3m',
    problemOp: '=',
    problemThreshold: '0',
    recoveryFunc: 'min',
    recoveryWindow: '3m',
    recoveryOp: '=',
    recoveryThreshold: '1',
    severity: 'Desastre',
    description: 'Garante que o link permaneça inacessível durante 3 minutos consecutivos antes de gerar incidente, e exige 3 min estáveis para fechar.',
    suggestedTags: [
      { tag: 'scope', value: 'availability' },
      { tag: 'component', value: 'network' },
    ],
  },
  {
    id: 'disk_space',
    label: 'Disco Rígido — Filesystem Crítico com Folga de Histerese',
    icon: <HardDrive className="w-4 h-4 text-purple-500" />,
    itemKey: 'vfs.fs.size[/,pfree]',
    problemFunc: 'last',
    problemWindow: '',
    problemOp: '<',
    problemThreshold: '10',
    recoveryFunc: 'last',
    recoveryWindow: '',
    recoveryOp: '>',
    recoveryThreshold: '15',
    severity: 'Alto',
    description: 'Dispara com menos de 10% livre e só fecha após limpeza ou expansão que garanta margem de 15%.',
    suggestedTags: [
      { tag: 'scope', value: 'storage' },
      { tag: 'component', value: 'filesystem' },
    ],
  },
  {
    id: 'net_interface_flapping',
    label: 'Interface de Rede — Supressão de Flapping com count()',
    icon: <Network className="w-4 h-4 text-blue-500" />,
    itemKey: 'net.if.status[eth0]',
    problemFunc: 'count',
    problemWindow: '10m, "ne", 1',
    problemOp: '>',
    problemThreshold: '2',
    recoveryFunc: 'count',
    recoveryWindow: '15m, "ne", 1',
    recoveryOp: '=',
    recoveryThreshold: '0',
    severity: 'Médio',
    description: 'Detecta mais de 2 oscilações de status na interface em 10 minutos e só encerra após 15 minutos de estabilidade contínua.',
    suggestedTags: [
      { tag: 'scope', value: 'hardware' },
      { tag: 'component', value: 'network-port' },
      { tag: 'anti-flapping', value: 'count-window' },
    ],
  },
  {
    id: 'service_port',
    label: 'Serviço de Aplicação / TCP — Porta Down com Tolerância',
    icon: <Server className="w-4 h-4 text-indigo-500" />,
    itemKey: 'net.tcp.service[tcp,,3306]',
    problemFunc: 'max',
    problemWindow: '3m',
    problemOp: '=',
    problemThreshold: '0',
    recoveryFunc: 'min',
    recoveryWindow: '3m',
    recoveryOp: '=',
    recoveryThreshold: '1',
    severity: 'Alto',
    description: 'Evita abertura de chamado durante restarts rápidos ou recargas de configuração do serviço.',
    suggestedTags: [
      { tag: 'scope', value: 'application' },
      { tag: 'component', value: 'database' },
    ],
  },
  {
    id: 'agent_ping',
    label: 'Agente Zabbix — Ausência de Coleta (nodata)',
    icon: <Zap className="w-4 h-4 text-amber-600" />,
    itemKey: 'agent.ping',
    problemFunc: 'nodata',
    problemWindow: '5m',
    problemOp: '=',
    problemThreshold: '1',
    recoveryFunc: 'nodata',
    recoveryWindow: '3m',
    recoveryOp: '=',
    recoveryThreshold: '0',
    severity: 'Alto',
    description: 'Alerta quando o Zabbix Server não receber métricas do agente por 5 minutos consecutivos.',
    suggestedTags: [
      { tag: 'scope', value: 'monitoring' },
      { tag: 'component', value: 'agent' },
    ],
  },
];

export const TriggerFactoryView: React.FC<TriggerFactoryViewProps> = ({
  onBackToApp,
  clients,
  selectedClientId,
  onSelectClient,
  events = [],
  kpis,
  onOpenValidator,
}) => {
  // Aba ativa: 'builder' | 'converter' | 'presets' | 'catalog'
  const [activeTab, setActiveTab] = useState<'builder' | 'converter' | 'presets' | 'catalog'>('builder');

  // Estado do Construtor
  const [hostName, setHostName] = useState<string>('SRV-APP-PROD-01');
  const [triggerName, setTriggerName] = useState<string>('Utilização de CPU Crítica com Proteção Anti-Flapping');
  const [itemKey, setItemKey] = useState<string>('system.cpu.util');
  const [problemFunc, setProblemFunc] = useState<string>('min');
  const [problemWindow, setProblemWindow] = useState<string>('5m');
  const [problemOp, setProblemOp] = useState<string>('>');
  const [problemThreshold, setProblemThreshold] = useState<string>('90');

  // Histerese / Expressão de Recuperação
  const [enableHysteresis, setEnableHysteresis] = useState<boolean>(true);
  const [recoveryFunc, setRecoveryFunc] = useState<string>('max');
  const [recoveryWindow, setRecoveryWindow] = useState<string>('10m');
  const [recoveryOp, setRecoveryOp] = useState<string>('<');
  const [recoveryThreshold, setRecoveryThreshold] = useState<string>('70');
  const [severity, setSeverity] = useState<'Informação' | 'Aviso' | 'Médio' | 'Alto' | 'Desastre'>('Alto');
  const [tags, setTags] = useState<{ tag: string; value: string }[]>([
    { tag: 'scope', value: 'performance' },
    { tag: 'hysteresis', value: 'active' },
  ]);

  // Conversor Legado
  const [legacyInput, setLegacyInput] = useState<string>(
    '{SRV-DB-01:system.cpu.util.last(0)}>90'
  );
  const [convertedResult, setConvertedResult] = useState<{
    problem: string;
    recovery: string;
    explanation: string;
  } | null>(null);

  // Notificação / Feedback
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Lista de Triggers do Catálogo do Cliente ou Global
  const [clientCatalog, setClientCatalog] = useState<ClientTriggerCatalog | null>(() => {
    return getActiveTriggerCatalog(selectedClientId);
  });

  // Atualiza catálogo quando o cliente selecionado mudar
  useEffect(() => {
    setClientCatalog(getActiveTriggerCatalog(selectedClientId));
  }, [selectedClientId]);

  // Carrega incidentes passados pelo sessionStorage (vindo de "Otimizar na Fábrica" da tabela)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('zabbix_factory_target');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.host) setHostName(String(parsed.host));
        if (parsed.trigger) setTriggerName(String(parsed.trigger));
        if (parsed.problemExpr) {
          // Extrai item key aproximada se disponível
          const matchKey = parsed.problemExpr.match(/\/([a-zA-Z0-9_.\-]+)\/([a-zA-Z0-9_.\-[\]"*,]+)/);
          if (matchKey && matchKey[2]) {
            setItemKey(matchKey[2]);
          }
        }
        setFeedback(`Alvo carregado do incidente: "${parsed.trigger}" no host "${parsed.host}".`);
        sessionStorage.removeItem('zabbix_factory_target');
      }
    } catch {
      // Ignora erro
    }
  }, []);

  // Extrai lista única de hosts dos eventos ativos para sugestões
  const availableHosts = useMemo(() => {
    const list = new Set<string>();
    events.forEach((e) => {
      const h = typeof e.host === 'object' && e.host !== null ? (e.host as any).host : String(e.host || '');
      if (h && h.trim()) list.add(h.trim());
    });
    return Array.from(list).sort();
  }, [events]);

  // Extrai top ofensores de ruído para 1-click tuning
  const topFlappingTriggers = useMemo(() => {
    const counts = new Map<string, { trigger: string; host: string; count: number; shortCount: number }>();
    events.forEach((e) => {
      const t = typeof e.incidente === 'object' && e.incidente !== null ? (e.incidente as any).trigger : String(e.incidente || '');
      const h = typeof e.host === 'object' && e.host !== null ? (e.host as any).host : String(e.host || '');
      if (!t) return;
      const key = `${h}::${t}`;
      const existing = counts.get(key) || { trigger: t, host: h, count: 0, shortCount: 0 };
      existing.count++;
      if (e.duracaoSegundos > 0 && e.duracaoSegundos <= 300) {
        existing.shortCount++;
      }
      counts.set(key, existing);
    });
    return Array.from(counts.values())
      .filter((item) => item.shortCount > 0 || item.count > 1)
      .sort((a, b) => b.shortCount - a.shortCount || b.count - a.count)
      .slice(0, 6);
  }, [events]);

  // Expressões computadas em tempo real na notação Zabbix 7.0
  const generatedProblemExpr = useMemo(() => {
    const cleanHost = hostName.trim() || 'HOST-ALVO';
    const cleanKey = itemKey.trim() || 'item.key';
    const cleanFunc = problemFunc.trim() || 'last';
    const windowParam = problemWindow.trim() ? `, ${problemWindow.trim()}` : '';
    const cleanOp = problemOp.trim() || '>';
    const cleanThresh = problemThreshold.trim() || '0';

    return `${cleanFunc}(/${cleanHost}/${cleanKey}${windowParam}) ${cleanOp} ${cleanThresh}`;
  }, [hostName, itemKey, problemFunc, problemWindow, problemOp, problemThreshold]);

  const generatedRecoveryExpr = useMemo(() => {
    if (!enableHysteresis) return '';
    const cleanHost = hostName.trim() || 'HOST-ALVO';
    const cleanKey = itemKey.trim() || 'item.key';
    const cleanFunc = recoveryFunc.trim() || 'last';
    const windowParam = recoveryWindow.trim() ? `, ${recoveryWindow.trim()}` : '';
    const cleanOp = recoveryOp.trim() || '<';
    const cleanThresh = recoveryThreshold.trim() || '0';

    return `${cleanFunc}(/${cleanHost}/${cleanKey}${windowParam}) ${cleanOp} ${cleanThresh}`;
  }, [enableHysteresis, hostName, itemKey, recoveryFunc, recoveryWindow, recoveryOp, recoveryThreshold]);

  // Cálculo de Score de Resiliência Anti-Ruído (0 a 100%)
  const qualityScore = useMemo(() => {
    let score = 50;
    if (enableHysteresis && generatedRecoveryExpr.trim()) score += 25;
    if (['min', 'avg', 'count', 'nodata'].includes(problemFunc)) score += 15;
    if (problemWindow.trim().length > 0) score += 10;
    return Math.min(100, score);
  }, [enableHysteresis, generatedRecoveryExpr, problemFunc, problemWindow]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleApplyPreset = (preset: MetricPreset) => {
    setItemKey(preset.itemKey);
    setProblemFunc(preset.problemFunc);
    setProblemWindow(preset.problemWindow);
    setProblemOp(preset.problemOp);
    setProblemThreshold(preset.problemThreshold);
    setRecoveryFunc(preset.recoveryFunc);
    setRecoveryWindow(preset.recoveryWindow);
    setRecoveryOp(preset.recoveryOp);
    setRecoveryThreshold(preset.recoveryThreshold);
    setSeverity(preset.severity);
    setEnableHysteresis(true);
    setTriggerName(preset.label);
    setTags(preset.suggestedTags);
    setActiveTab('builder');
    setFeedback(`Preset "${preset.label}" aplicado no Construtor.`);
  };

  const handleLoadOffender = (offender: { trigger: string; host: string; shortCount: number }) => {
    setTriggerName(offender.trigger);
    setHostName(offender.host);
    // Tenta deduzir métrica a partir do nome
    const lower = offender.trigger.toLowerCase();
    if (lower.includes('cpu')) {
      handleApplyPreset(OFFICIAL_PRESETS[0]);
    } else if (lower.includes('mem') || lower.includes('ram')) {
      handleApplyPreset(OFFICIAL_PRESETS[1]);
    } else if (lower.includes('ping') || lower.includes('icmp') || lower.includes('link') || lower.includes('down')) {
      handleApplyPreset(OFFICIAL_PRESETS[2]);
    } else if (lower.includes('disk') || lower.includes('disco') || lower.includes('storage') || lower.includes('space')) {
      handleApplyPreset(OFFICIAL_PRESETS[3]);
    } else if (lower.includes('interface') || lower.includes('port') || lower.includes('eth')) {
      handleApplyPreset(OFFICIAL_PRESETS[4]);
    } else {
      setActiveTab('builder');
      setFeedback(`Ofensor "${offender.trigger}" no host "${offender.host}" carregado.`);
    }
    setHostName(offender.host);
    setTriggerName(offender.trigger);
  };

  // Conversão de sintaxe legada
  const handleConvertLegacy = () => {
    const raw = legacyInput.trim();
    if (!raw) return;

    // Detecta padrão legado: {HOST:item.func(param)} OP THRESH
    const legacyPattern = /\{([a-zA-Z0-9_.\-]+):([a-zA-Z0-9_.\-[\]"*,]+)\.([a-zA-Z0-9_]+)\(([^)]*)\)\}\s*([<>=!]+)\s*([0-9.a-zA-Z]+)/;
    const match = raw.match(legacyPattern);

    if (match) {
      const [, host, key, func, param, op, thresh] = match;
      const modernProblem = `${func}(/${host}/${key}${param ? `, ${param}` : ''}) ${op} ${thresh}`;
      
      // Gera recuperação inteligente
      let recOp = '<';
      let recThresh = String(Number(thresh) * 0.8 || '70');
      let recFunc = func;
      if (op === '>') {
        recOp = '<';
        recThresh = String(Math.round(Number(thresh) * 0.8));
        recFunc = 'max';
      } else if (op === '<') {
        recOp = '>';
        recThresh = String(Math.round(Number(thresh) * 1.25));
        recFunc = 'min';
      } else if (op === '=') {
        recOp = '=';
        recThresh = thresh === '0' ? '1' : '0';
        recFunc = 'min';
      }

      const modernRecovery = `${recFunc}(/${host}/${key}${param ? `, 10m` : ''}) ${recOp} ${recThresh}`;

      setConvertedResult({
        problem: modernProblem,
        recovery: modernRecovery,
        explanation: `Sintaxe legada Zabbix 5.0 convertida com sucesso para o padrão moderno Zabbix 7.0. Foi gerada automaticamente uma Expressão de Recuperação com histerese para evitar flapping recorrente.`,
      });
    } else {
      // Se já está na sintaxe moderna ou é expressão simples
      setConvertedResult({
        problem: raw,
        recovery: `min(/HOST/item.key, 10m) = 1`,
        explanation: `Expressão formatada no padrão moderno Zabbix 7.0. Sugerida expressão de recuperação complementar.`,
      });
    }
  };

  // Salvar no Catálogo do Cliente
  const handleSaveToCatalog = () => {
    const targetClientId = selectedClientId || (clients[0] ? clients[0].id : 'global');
    const newItem: ZabbixTriggerCatalogItem = {
      id: `trig_${Date.now()}`,
      host: hostName.trim() || 'HOST-GERAL',
      name: triggerName.trim() || 'Trigger Otimizada',
      expression: generatedProblemExpr,
      parsedItemKey: itemKey,
      parsedFunction: problemFunc,
      parsedThreshold: `${problemOp} ${problemThreshold}`,
    };

    const currentCat = getActiveTriggerCatalog(targetClientId);
    const updatedItems = currentCat ? [newItem, ...currentCat.items] : [newItem];

    const newCatalog: ClientTriggerCatalog = {
      clientId: targetClientId,
      fileName: 'fabrica_de_triggers_zabbix.xlsx',
      updatedAt: new Date().toISOString(),
      totalTriggers: updatedItems.length,
      items: updatedItems,
    };

    if (targetClientId === 'global') {
      saveCompanyGlobalTriggerCatalog(newCatalog);
    } else {
      saveClientTriggerCatalog(targetClientId, newCatalog);
    }

    setClientCatalog(newCatalog);
    setFeedback(`Trigger "${newItem.name}" salva com sucesso no Catálogo.`);
  };

  // Excluir item do catálogo
  const handleDeleteCatalogItem = (itemId: string) => {
    if (!clientCatalog) return;
    const filtered = clientCatalog.items.filter((i) => i.id !== itemId);
    const updatedCat: ClientTriggerCatalog = {
      ...clientCatalog,
      totalTriggers: filtered.length,
      items: filtered,
    };

    const targetClientId = selectedClientId || 'global';
    if (targetClientId === 'global') {
      saveCompanyGlobalTriggerCatalog(updatedCat);
    } else {
      saveClientTriggerCatalog(targetClientId, updatedCat);
    }
    setClientCatalog(updatedCat);
    setFeedback('Item removido do catálogo.');
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Barra Superior de Navegação & Contexto */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToApp}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              title="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Wrench className="w-6 h-6 text-amber-500" />
                  <span>Fábrica de Triggers Zabbix 7.0</span>
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Engenharia Anti-Flapping
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Construtor de expressões com histerese operacional, conversor de sintaxe legada e conformidade SNOC.
              </p>
            </div>
          </div>

          {/* Seletor de Cliente e Ações Globais */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              <Building2 className="w-4 h-4 text-blue-500" />
              <select
                value={selectedClientId}
                onChange={(e) => onSelectClient(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
              >
                <option value="">🏢 Catálogo Global (Empresa)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    👤 {c.name}
                  </option>
                ))}
              </select>
            </div>

            {onOpenValidator && (
              <button
                type="button"
                onClick={() =>
                  onOpenValidator(
                    generatedProblemExpr,
                    generatedRecoveryExpr,
                    triggerName,
                    hostName
                  )
                }
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Auditar no Validador</span>
              </button>
            )}

            <button
              type="button"
              onClick={onBackToApp}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Voltar ao Dashboard
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{feedback}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs hover:underline cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Barra de Acesso Rápido a Ofensores do Período Atual (se houver dados carregados) */}
        {topFlappingTriggers.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Top Ofensores com Flapping no Relatório Ativo ({events.length} incidentes analisados)</span>
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                Clique para carregar e otimizar na Fábrica
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {topFlappingTriggers.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleLoadOffender(item)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-600 transition-all text-left group cursor-pointer shadow-2xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400">
                      {item.trigger}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">
                      {item.host}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                      {item.shortCount} ruídos &lt; 5m
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Abas Principais */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('builder')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              activeTab === 'builder'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>1. Construtor Visual &amp; Histerese</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>2. Presets Homologados SNOC ({OFFICIAL_PRESETS.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('converter')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              activeTab === 'converter'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>3. Conversor de Legado (Zabbix 4/5 para 7)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              activeTab === 'catalog'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>4. Catálogo do Cliente ({clientCatalog?.items.length || 0})</span>
          </button>
        </div>

        {/* ===================== CONTEÚDO DAS ABAS ===================== */}

        {/* ABA 1: CONSTRUTOR VISUAL */}
        {activeTab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Formulário de Configuração (7 colunas) */}
            <div className="lg:col-span-7 space-y-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-500" />
                  <span>Parâmetros de Alvo &amp; Condição Operacional</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure o ativo e a função matemática Zabbix 7.0 para detecção da falha.
                </p>
              </div>

              {/* Linha 1: Nome do Alvo e Ativo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Trigger Zabbix
                  </label>
                  <input
                    type="text"
                    value={triggerName}
                    onChange={(e) => setTriggerName(e.target.value)}
                    placeholder="Ex: Alta Utilização de CPU"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Host / Servidor Alvo
                  </label>
                  <input
                    type="text"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    list="hosts-datalist"
                    placeholder="Ex: SRV-APP-PROD-01"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono"
                  />
                  <datalist id="hosts-datalist">
                    {availableHosts.map((h, i) => (
                      <option key={i} value={h} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Linha 2: Item Key e Severidade */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Chave do Item (Item Key Zabbix)
                  </label>
                  <input
                    type="text"
                    value={itemKey}
                    onChange={(e) => setItemKey(e.target.value)}
                    placeholder="Ex: system.cpu.util ou vm.memory.size[pavailable]"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Criticidade / Severidade
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-bold cursor-pointer"
                  >
                    <option value="Informação">ℹ️ Informação</option>
                    <option value="Aviso">⚠️ Aviso</option>
                    <option value="Médio">⚡ Médio</option>
                    <option value="Alto">🔥 Alto</option>
                    <option value="Desastre">💥 Desastre</option>
                  </select>
                </div>
              </div>

              {/* Linha 3: Expressão de Problema */}
              <div className="p-4 rounded-xl bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span>1. Condição de Problema (Problem Expression)</span>
                  </span>
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-mono">
                    Disparo do Alarme
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Função Zabbix
                    </label>
                    <select
                      value={problemFunc}
                      onChange={(e) => setProblemFunc(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    >
                      <option value="min">min() [Mínimo contínuo]</option>
                      <option value="avg">avg() [Média móvel]</option>
                      <option value="max">max() [Pico máximo]</option>
                      <option value="last">last() [Última amostra]</option>
                      <option value="nodata">nodata() [Sem dados]</option>
                      <option value="count">count() [Contagem]</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Janela Temporal
                    </label>
                    <input
                      type="text"
                      value={problemWindow}
                      onChange={(e) => setProblemWindow(e.target.value)}
                      placeholder="Ex: 5m, 10m ou #3"
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Operador
                    </label>
                    <select
                      value={problemOp}
                      onChange={(e) => setProblemOp(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    >
                      <option value=">">&gt; (Maior que)</option>
                      <option value="<">&lt; (Menor que)</option>
                      <option value="=">= (Igual a)</option>
                      <option value=">=">&gt;= (Maior ou igual)</option>
                      <option value="<=">&lt;= (Menor ou igual)</option>
                      <option value="ne">ne (Diferente)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Limiar (Threshold)
                    </label>
                    <input
                      type="text"
                      value={problemThreshold}
                      onChange={(e) => setProblemThreshold(e.target.value)}
                      placeholder="Ex: 90"
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Linha 4: Histerese Operacional (Expressão de Recuperação) */}
              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enable-hysteresis"
                      checked={enableHysteresis}
                      onChange={(e) => setEnableHysteresis(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded-sm cursor-pointer"
                    />
                    <label
                      htmlFor="enable-hysteresis"
                      className="text-xs font-bold text-emerald-800 dark:text-emerald-300 cursor-pointer flex items-center gap-1"
                    >
                      <span>2. Habilitar Histerese &amp; Recuperação Anti-Flapping (Recomendado)</span>
                    </label>
                  </div>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">
                    Fechamento do Alarme
                  </span>
                </div>

                {enableHysteresis && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 animate-in fade-in">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Função Recuperação
                      </label>
                      <select
                        value={recoveryFunc}
                        onChange={(e) => setRecoveryFunc(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      >
                        <option value="max">max() [Pico máximo]</option>
                        <option value="min">min() [Mínimo contínuo]</option>
                        <option value="avg">avg() [Média móvel]</option>
                        <option value="last">last() [Última amostra]</option>
                        <option value="nodata">nodata() [Sem dados]</option>
                        <option value="count">count() [Contagem]</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Janela Recuperação
                      </label>
                      <input
                        type="text"
                        value={recoveryWindow}
                        onChange={(e) => setRecoveryWindow(e.target.value)}
                        placeholder="Ex: 10m"
                        className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Operador
                      </label>
                      <select
                        value={recoveryOp}
                        onChange={(e) => setRecoveryOp(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      >
                        <option value="<">&lt; (Menor que)</option>
                        <option value=">">&gt; (Maior que)</option>
                        <option value="=">= (Igual a)</option>
                        <option value="<=">&lt;= (Menor ou igual)</option>
                        <option value=">=">&gt;= (Maior ou igual)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Limiar Recuperação
                      </label>
                      <input
                        type="text"
                        value={recoveryThreshold}
                        onChange={(e) => setRecoveryThreshold(e.target.value)}
                        placeholder="Ex: 70"
                        className="w-full px-2 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Painel de Auditoria & Especificação Zabbix 7.0 (5 colunas) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Card de Score e Qualidade */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Índice de Confiabilidade Anti-Ruído
                    </span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                    <span>{qualityScore}%</span>
                  </div>
                </div>

                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      qualityScore >= 85
                        ? 'bg-emerald-500'
                        : qualityScore >= 60
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${qualityScore}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 leading-relaxed">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Sintaxe moderna padronizada Zabbix 7.0: <code>func(/host/key)</code></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {enableHysteresis ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <span>
                      {enableHysteresis
                        ? 'Proteção contra oscilação de alarmes (Recovery Expression ativa)'
                        : 'Sem histerese: risco moderado de reaberturas no limiar'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Mitigação de ruídos &lt; 5m através de janela temporal ponderada</span>
                  </div>
                </div>
              </div>

              {/* Bloco de Código Zabbix 7.0 para Copiar */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl border border-slate-800 shadow-md space-y-3 font-mono text-xs">
                {/* Problem Expression */}
                <div>
                  <div className="flex items-center justify-between text-red-400 text-[11px] font-bold mb-1">
                    <span>// PROBLEM EXPRESSION:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(generatedProblemExpr, 'prob')}
                      className="hover:text-white cursor-pointer flex items-center gap-1"
                    >
                      {copiedKey === 'prob' ? (
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copiedKey === 'prob' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-red-200 break-all select-all">
                    {generatedProblemExpr}
                  </div>
                </div>

                {/* Recovery Expression */}
                {enableHysteresis && generatedRecoveryExpr && (
                  <div>
                    <div className="flex items-center justify-between text-emerald-400 text-[11px] font-bold mb-1">
                      <span>// RECOVERY EXPRESSION:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(generatedRecoveryExpr, 'rec')}
                        className="hover:text-white cursor-pointer flex items-center gap-1"
                      >
                        {copiedKey === 'rec' ? (
                          <CheckCheck className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedKey === 'rec' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-emerald-200 break-all select-all">
                      {generatedRecoveryExpr}
                    </div>
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const fullSpec = `Trigger: ${triggerName}\nHost: ${hostName}\nSeveridade: ${severity}\n\n// PROBLEM:\n${generatedProblemExpr}\n\n// RECOVERY:\n${generatedRecoveryExpr}\n\n// TAGS:\n${tags.map((t) => `${t.tag}:${t.value}`).join(', ')}`;
                      handleCopy(fullSpec, 'full');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {copiedKey === 'full' ? (
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>Copiar Laudo Completo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveToCatalog}
                    className="py-2 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar no Catálogo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: PRESETS HOMOLOGADOS */}
        {activeTab === 'presets' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Biblioteca SNOC de Triggers Homologadas Zabbix 7.0</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Templates com proteção de histerese e calibração estatística contra ruído operacional.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {OFFICIAL_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-amber-400 dark:hover:border-amber-600 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
                          {preset.icon}
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                            {preset.label}
                          </h3>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            {preset.itemKey}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                        {preset.severity}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {preset.description}
                    </p>

                    <div className="space-y-1.5 pt-1 text-[11px] font-mono">
                      <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40 truncate">
                        <strong>Problem:</strong> {preset.problemFunc}(/HOST/{preset.itemKey}{preset.problemWindow ? `, ${preset.problemWindow}` : ''}) {preset.problemOp} {preset.problemThreshold}
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40 truncate">
                        <strong>Recovery:</strong> {preset.recoveryFunc}(/HOST/{preset.itemKey}{preset.recoveryWindow ? `, ${preset.recoveryWindow}` : ''}) {preset.recoveryOp} {preset.recoveryThreshold}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Carregar no Construtor</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 3: CONVERSOR DE LEGADO */}
        {activeTab === 'converter' && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-500" />
                <span>Conversor e Otimizador de Sintaxe Legada Zabbix</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cole expressões no padrão antigo do Zabbix 4.0 / 5.0 (<code>{'{HOST:item.func()}'}</code>) e converta automaticamente para a sintaxe Zabbix 7.0 com histerese.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Expressão Legada Zabbix:
              </label>
              <textarea
                value={legacyInput}
                onChange={(e) => setLegacyInput(e.target.value)}
                rows={3}
                placeholder="Ex: {SRV-DB-01:system.cpu.util.last(0)}>90"
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              type="button"
              onClick={handleConvertLegacy}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>Otimizar &amp; Modernizar para Zabbix 7.0</span>
            </button>

            {convertedResult && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 animate-in fade-in">
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Resultado da Modernização:</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {convertedResult.explanation}
                </p>

                <div className="space-y-2 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40">
                    <div className="text-[10px] font-bold uppercase mb-1">Expressão Zabbix 7.0 (Problema):</div>
                    {convertedResult.problem}
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40">
                    <div className="text-[10px] font-bold uppercase mb-1">Expressão Zabbix 7.0 (Recuperação):</div>
                    {convertedResult.recovery}
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHostName('SRV-LEGACY');
                      setProblemFunc('min');
                      setProblemWindow('5m');
                      setRecoveryWindow('10m');
                      setEnableHysteresis(true);
                      setActiveTab('builder');
                      setFeedback('Expressão convertida aplicada no Construtor.');
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                  >
                    Editar no Construtor Visual
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 4: CATÁLOGO DO CLIENTE / REPOSITÓRIO */}
        {activeTab === 'catalog' && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-500" />
                  <span>Catálogo de Triggers &amp; Expressões ({clientCatalog?.items.length || 0} cadastradas)</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Escopo ativo: <strong>{selectedClientId ? clients.find((c) => c.id === selectedClientId)?.name : 'Catálogo Global da Empresa'}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('builder')}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Nova Trigger no Construtor</span>
              </button>
            </div>

            {(!clientCatalog || clientCatalog.items.length === 0) ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-600 space-y-2">
                <FileCode className="w-10 h-10 mx-auto opacity-50" />
                <p className="text-xs">Nenhuma trigger cadastrada neste catálogo ainda.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('presets')}
                  className="text-xs text-amber-600 dark:text-amber-400 font-bold hover:underline cursor-pointer"
                >
                  Importar presets recomendados agora
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] uppercase">
                      <th className="py-2.5 px-3">Trigger / Nome</th>
                      <th className="py-2.5 px-3">Host</th>
                      <th className="py-2.5 px-3 font-mono">Expressão Zabbix 7.0</th>
                      <th className="py-2.5 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {clientCatalog.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                          {item.name}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {item.host}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 max-w-[320px] truncate">
                          {item.expression}
                        </td>
                        <td className="py-3 px-3 text-right space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopy(item.expression, item.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Copiar expressão"
                          >
                            {copiedKey === item.id ? (
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCatalogItem(item.id)}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                            title="Remover do catálogo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
