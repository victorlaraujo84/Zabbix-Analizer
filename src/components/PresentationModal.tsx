import React, { useState, useMemo } from 'react';
import {
  X,
  Presentation,
  Download,
  ChevronLeft,
  ChevronRight,
  Building2,
  Calendar,
  CheckCircle2,
  FileCode,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Layers,
  Sparkles,
  Info,
  Clock,
  Activity,
  Cpu,
  Server,
  Zap,
  BookOpen,
  Code2,
} from 'lucide-react';
import { ZabbixEvent, ZabbixFilters, ZabbixKPIs } from '../types/zabbix';
import { formatDuration } from '../utils/parser';
import { exportPresentationToPPTX } from '../utils/pptxExport';
import {
  generateTriggerTuningPrompt,
  generateExecutiveReportPrompt,
  generateBookDeResultadosPrompt,
} from '../utils/analytics';

interface PresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: ZabbixEvent[];
  kpis: ZabbixKPIs;
  activeFilters: ZabbixFilters;
  defaultClientName?: string;
  initialAiNarrative?: string;
  companyName?: string;
}

export const PresentationModal: React.FC<PresentationModalProps> = ({
  isOpen,
  onClose,
  events,
  kpis,
  activeFilters,
  defaultClientName = 'Cliente Corporativo',
  initialAiNarrative,
  companyName = 'SNOC Observability Suite',
}) => {
  const [theme, setTheme] = useState<'executivo' | 'tecnico' | 'book_resultados'>('book_resultados');
  const [clientName, setClientName] = useState(defaultClientName);
  const [docCode, setDocCode] = useState('PPTX-NOC-2026');
  const [author, setAuthor] = useState('Equipe de Observabilidade & SRE');
  const [customDirectives, setCustomDirectives] = useState('');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Sincroniza nome do cliente se mudar externamente
  React.useEffect(() => {
    if (defaultClientName) {
      setClientName(defaultClientName);
    }
  }, [defaultClientName]);

  const shortPct = kpis.totalEventos > 0
    ? Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100)
    : 0;

  const hostAfetadoStr = typeof kpis.hostMaisAfetado?.host === 'object' && kpis.hostMaisAfetado?.host !== null
    ? ((kpis.hostMaisAfetado.host as any).host || String(kpis.hostMaisAfetado.host))
    : String(kpis.hostMaisAfetado?.host || 'Nenhum');

  const triggerFreqStr = typeof kpis.triggerMaisFrequente?.trigger === 'object' && kpis.triggerMaisFrequente?.trigger !== null
    ? ((kpis.triggerMaisFrequente.trigger as any).trigger || String(kpis.triggerMaisFrequente.trigger))
    : String(kpis.triggerMaisFrequente?.trigger || 'Nenhuma');

  // Top 5 Hosts
  const topHosts = useMemo<[string, number][]>(() => {
    const counts = new Map<string, number>();
    events.forEach((e) => {
      const h = typeof e.host === 'object' && e.host !== null ? (e.host as any).host : String(e.host || '');
      if (h && h.trim()) counts.set(h, (counts.get(h) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [events]);

  // Contagem de severidades defensiva (nunca falha mesmo se kpis.porSeveridade for indefinido)
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Desastre: 0,
      Alto: 0,
      Médio: 0,
      Aviso: 0,
      Informação: 0,
    };
    if (kpis?.porSeveridade) {
      counts.Desastre = kpis.porSeveridade['Desastre'] || 0;
      counts.Alto = kpis.porSeveridade['Alto'] || kpis.porSeveridade['Alta'] || 0;
      counts.Médio = kpis.porSeveridade['Médio'] || kpis.porSeveridade['Média'] || 0;
      counts.Aviso = kpis.porSeveridade['Aviso'] || kpis.porSeveridade['Atenção'] || 0;
      counts.Informação = kpis.porSeveridade['Informação'] || 0;
      return counts;
    }
    events.forEach((e) => {
      const s = e.severidade;
      if (s === 'Desastre') counts.Desastre++;
      else if (s === 'Alta' || s === 'Alto') counts.Alto++;
      else if (s === 'Média' || s === 'Médio') counts.Médio++;
      else if (s === 'Atenção' || s === 'Aviso') counts.Aviso++;
      else if (s === 'Informação') counts.Informação++;
    });
    return counts;
  }, [kpis, events]);

  // Lista de Slides para o Preview de acordo com o Tema
  const slides = useMemo(() => {
    const list = [
      { id: 'cover', title: 'Capa Corporativa', section: 'Abertura' },
      { id: 'kpis', title: 'Indicadores Globais', section: '01. Performance' },
      { id: 'diagnosis', title: 'Diagnóstico & Causa Raiz', section: '02. Diagnóstico' },
      { id: 'offenders', title: 'Matriz de Ofensores', section: '03. Infraestrutura' },
      { id: 'actions', title: 'Plano de Ação', section: '04. Recomendações' },
    ];

    if (theme === 'tecnico') {
      list.push(
        { id: 'severity', title: 'Severidade & Status', section: '05. Distribuição' },
        { id: 'tuning', title: 'Calibração de Triggers', section: '06. Zabbix 7.0' }
      );
    } else if (theme === 'book_resultados') {
      list.push(
        { id: 'tuning', title: 'Calibração de Triggers', section: '05. Zabbix 7.0' },
        { id: 'prompt_appendix', title: 'Apêndice de Prompt IA', section: '06. Governança' }
      );
    }

    return list;
  }, [theme]);

  const compiledPrompt = useMemo(() => {
    if (theme === 'book_resultados') {
      return generateBookDeResultadosPrompt(
        events,
        kpis,
        activeFilters,
        events.length,
        undefined,
        customDirectives
      );
    }
    if (theme === 'executivo') {
      const p = generateExecutiveReportPrompt(events, kpis, activeFilters, events.length);
      return customDirectives ? `${p}\n\n### DIRETRIZES DO AUDITOR:\n${customDirectives}` : p;
    }
    const p = generateTriggerTuningPrompt(events, kpis, activeFilters, events.length);
    return customDirectives ? `${p}\n\n### DIRETRIZES DO AUDITOR:\n${customDirectives}` : p;
  }, [theme, events, kpis, activeFilters, customDirectives]);

  // Se trocar de tema e o slide atual for maior que o número de slides, ajusta
  React.useEffect(() => {
    if (currentSlideIndex >= slides.length) {
      setCurrentSlideIndex(0);
    }
  }, [slides.length, currentSlideIndex]);

  const handlePrevSlide = () => {
    setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : slides.length - 1));
  };

  const handleNextSlide = () => {
    setCurrentSlideIndex((prev) => (prev < slides.length - 1 ? prev + 1 : 0));
  };

  const handleDownloadPPTX = async () => {
    setIsExporting(true);
    setFeedback(null);
    try {
      await exportPresentationToPPTX({
        theme,
        clientName,
        docCode,
        author,
        events,
        kpis,
        activeFilters,
        aiNarrative: initialAiNarrative,
        companyName,
        promptText: compiledPrompt,
        customDirectives,
      });
      setFeedback('Apresentação (.pptx) gerada e baixada com sucesso!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      alert(`Falha ao gerar apresentação PowerPoint: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const currentSlide = slides[currentSlideIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 my-6 max-h-[94vh] flex flex-col transition-colors">
        {/* Header do Modal */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Presentation className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Exportar Apresentação em PowerPoint (*.pptx)
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Widescreen 16:9
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Gere slides executivos prontos para reuniões com C-Level e diretoria técnica com identidade corporativa.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div className="my-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Barra de Controles: Seletor de Modelo & Metadados */}
        <div className="pt-3 pb-3 grid grid-cols-1 md:grid-cols-12 gap-3 border-b border-slate-200 dark:border-slate-800 text-xs">
          {/* Seletor de Modelo */}
          <div className="md:col-span-5 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
              Modelo da Apresentação
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setTheme('executivo')}
                className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer border text-center ${
                  theme === 'executivo'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                👔 Executivo (5)
              </button>
              <button
                type="button"
                onClick={() => setTheme('tecnico')}
                className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer border text-center ${
                  theme === 'tecnico'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                🛠️ Técnico (7)
              </button>
              <button
                type="button"
                onClick={() => setTheme('book_resultados')}
                className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer border text-center ${
                  theme === 'book_resultados'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                📖 Book (6)
              </button>
            </div>
          </div>

          {/* Nome do Cliente */}
          <div className="md:col-span-4 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
              Cliente / Identidade Visual
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ex: Stefanini Global"
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-medium"
            />
          </div>

          {/* Código do Documento */}
          <div className="md:col-span-3 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
              Código do Laudo
            </label>
            <input
              type="text"
              value={docCode}
              onChange={(e) => setDocCode(e.target.value)}
              placeholder="Ex: PPTX-NOC-2026"
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono"
            />
          </div>
        </div>

        {/* Área Central: Carrossel de Pré-visualização Widescreen 16:9 */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {/* Barra de Navegação do Carrossel */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Pré-visualização do Slide {currentSlideIndex + 1} de {slides.length}:
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {currentSlide.section} · {currentSlide.title}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrevSlide}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                title="Slide Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextSlide}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                title="Próximo Slide"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Moldura do Slide Widescreen (16:9) */}
          <div className="w-full flex justify-center bg-slate-200 dark:bg-slate-950 p-3 sm:p-4 rounded-2xl border border-slate-300 dark:border-slate-800">
            <div className="w-full max-w-[820px] aspect-video bg-white text-slate-900 shadow-2xl rounded-sm overflow-hidden flex flex-col justify-between border border-slate-300 select-none text-[11px] font-sans">
              {/* SLIDE: CAPA */}
              {currentSlide.id === 'cover' && (
                <div className="h-full bg-slate-900 text-white p-6 sm:p-8 flex flex-col justify-between relative">
                  <div className="absolute top-0 left-0 bottom-0 w-2 bg-blue-600"></div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 block mb-1">
                      {theme === 'executivo' ? 'RELATÓRIO EXECUTIVO C-LEVEL' : 'LAUDO TÉCNICO DE ENGENHARIA & NOC'}
                    </span>
                    <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
                      Auditoria Operacional &amp; Diagnóstico de Confiabilidade
                    </h1>
                    <p className="text-xs text-slate-400 mt-2 max-w-lg leading-relaxed">
                      Análise estatística de incidentes Zabbix, mitigação de ruído operacional e governança de infraestrutura.
                    </p>
                  </div>

                  <div className="border-t border-slate-800 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <span className="text-slate-500 uppercase block text-[8px] font-bold">Cliente</span>
                      <span className="font-bold text-white text-xs">{clientName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase block text-[8px] font-bold">Auditoria</span>
                      <span className="font-bold text-white text-xs">{new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase block text-[8px] font-bold">Volume</span>
                      <span className="font-bold text-sky-400 text-xs font-mono">{kpis.totalEventos} incidentes</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SLIDE: INDICADORES GLOBAIS */}
              {currentSlide.id === 'kpis' && (
                <div className="h-full bg-slate-50 p-5 flex flex-col justify-between">
                  <div className="border-b border-slate-200 pb-2">
                    <div className="text-[8.5px] font-bold text-slate-500 uppercase">
                      {companyName} · {clientName} · {docCode}
                    </div>
                    <h2 className="text-base font-black text-slate-900">
                      01. Indicadores Globais de Performance &amp; Confiabilidade
                    </h2>
                  </div>

                  {/* 4 Cards */}
                  <div className="grid grid-cols-4 gap-2 my-auto">
                    <div className="bg-white p-2.5 rounded border border-slate-200 border-t-3 border-t-emerald-500 shadow-2xs">
                      <span className="text-[8px] font-bold text-emerald-700 uppercase block">DISPONIBILIDADE</span>
                      <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
                        {kpis.mtbfDetails?.taxaDisponibilidadePct !== undefined
                          ? `${kpis.mtbfDetails.taxaDisponibilidadePct.toFixed(2)}%`
                          : '99.4%'}
                      </div>
                      <span className="text-[8px] text-slate-500 font-mono">Meta: 99.0% · Base {kpis.totalHorasPlanejadasPeriodo || 720}h ({kpis.totalDiasPeriodo || 30}d)</span>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200 border-t-3 border-t-red-500 shadow-2xs">
                      <span className="text-[8px] font-bold text-red-700 uppercase block">RUÍDO OPERACIONAL</span>
                      <div className="text-xl font-black text-red-600 font-mono mt-0.5">{shortPct}%</div>
                      <span className="text-[8px] text-slate-500">{kpis.totalRuidoOperacional} de {kpis.totalEventos} &lt; 5m</span>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200 border-t-3 border-t-blue-500 shadow-2xs">
                      <span className="text-[8px] font-bold text-blue-700 uppercase block">MTTR MÉDIO</span>
                      <div className="text-base font-black text-slate-900 font-mono mt-0.5 truncate">
                        {formatDuration(kpis.mttrSegundos)}
                      </div>
                      <span className="text-[8px] text-slate-500">Tempo Resolução</span>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200 border-t-3 border-t-cyan-500 shadow-2xs">
                      <span className="text-[8px] font-bold text-cyan-700 uppercase block">MTBF NOC (24x7)</span>
                      <div className="text-base font-black text-slate-900 font-mono mt-0.5 truncate">
                        {formatDuration(kpis.mtbfSegundosGlobal)}
                      </div>
                      <span className="text-[8px] text-slate-500">{kpis.mtbfDetails?.numeroFalhasCriticas ?? 0} falha(s) crítica(s)</span>
                    </div>
                  </div>

                  {/* Síntese */}
                  <div className="bg-white p-2.5 rounded border border-slate-200 text-[9px] leading-relaxed text-slate-700">
                    <strong className="text-slate-900 block mb-0.5">Síntese Operacional:</strong>
                    A disponibilidade média do ambiente em regime 24x7 (base de {kpis.totalHorasPlanejadasPeriodo || 720}h em {kpis.totalDiasPeriodo || 30} dias) atingiu <strong>{kpis.mtbfDetails?.taxaDisponibilidadePct !== undefined ? `${kpis.mtbfDetails.taxaDisponibilidadePct.toFixed(2)}%` : '99.4%'}</strong>, com MTBF NOC de <strong>{formatDuration(kpis.mtbfSegundosGlobal)}</strong> entre falhas críticas de infraestrutura. <strong>{shortPct}%</strong> dos alarmes foram ruídos curtos autorresolvidos e o host <strong>{hostAfetadoStr}</strong> concentrou <strong>{kpis.hostMaisAfetado?.count ?? 0} eventos</strong>.
                  </div>
                </div>
              )}

              {/* SLIDE: DIAGNÓSTICO ESTRATÉGICO */}
              {currentSlide.id === 'diagnosis' && (
                <div className="h-full bg-slate-50 p-5 flex flex-col justify-between">
                  <div className="border-b border-slate-200 pb-2">
                    <div className="text-[8.5px] font-bold text-slate-500 uppercase">
                      {companyName} · {clientName} · {docCode}
                    </div>
                    <h2 className="text-base font-black text-slate-900">
                      02. Diagnóstico Estratégico de Confiabilidade
                    </h2>
                  </div>

                  <div className="bg-white p-4 rounded border border-slate-200 my-auto text-[9.5px] text-slate-700 leading-relaxed max-h-[220px] overflow-hidden whitespace-pre-wrap">
                    {initialAiNarrative || `No período analisado para ${clientName}, foram catalogados ${kpis.totalEventos} incidentes Zabbix.\n\nAproximadamente ${shortPct}% dos alarmes duraram menos de 5 minutos, apontando saturação cognitiva e fadiga no monitoramento contínuo.\n\nO servidor "${hostAfetadoStr}" foi responsável pelo maior volume de incidentes (${kpis.hostMaisAfetado?.count ?? 0}), evidenciando flapping de métricas sem margem de histerese para recuperação.\n\nRecomenda-se calibração preventiva com funções de janela temporal (min(), avg()) e criação de regras de histerese.`}
                  </div>

                  <div className="text-[8px] text-slate-400 border-t border-slate-200 pt-1">
                    Auditoria de Observabilidade · {new Date().toLocaleDateString('pt-BR')}
                  </div>
                </div>
              )}

              {/* SLIDE: OFENSORES */}
              {currentSlide.id === 'offenders' && (
                <div className="h-full bg-slate-50 p-5 flex flex-col justify-between">
                  <div className="border-b border-slate-200 pb-2">
                    <div className="text-[8.5px] font-bold text-slate-500 uppercase">
                      {companyName} · {clientName} · {docCode}
                    </div>
                    <h2 className="text-base font-black text-slate-900">
                      03. Ativos Críticos &amp; Matriz de Ofensores
                    </h2>
                  </div>

                  <table className="w-full text-left text-[9px] border-collapse my-auto">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[8px]">
                        <th className="p-1.5">Host / Ativo Crítico</th>
                        <th className="p-1.5 text-center">Incidentes</th>
                        <th className="p-1.5 text-center">Volume %</th>
                        <th className="p-1.5">Classificação de Risco</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {topHosts.slice(0, 4).map(([host, count], idx) => (
                        <tr key={idx}>
                          <td className="p-1.5 font-bold">{host}</td>
                          <td className="p-1.5 text-center font-mono font-bold">{count}</td>
                          <td className="p-1.5 text-center font-mono">
                            {kpis.totalEventos > 0 ? Math.round((count / kpis.totalEventos) * 100) : 0}%
                          </td>
                          <td className="p-1.5 font-bold text-red-700">
                            {idx === 0 ? 'CRÍTICO — Alto Flapping' : 'ALTO — Oscilações Contínuas'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="bg-amber-50 border border-amber-200 p-2 rounded text-[8.5px] text-amber-900">
                    <strong>Diretriz:</strong> Substituir triggers com last() por agregações com min(..., 5m) para eliminar oscilações e alarmes falsos de saturação.
                  </div>
                </div>
              )}

              {/* SLIDE: PLANO DE AÇÃO */}
              {currentSlide.id === 'actions' && (
                <div className="h-full bg-slate-50 p-5 flex flex-col justify-between">
                  <div className="border-b border-slate-200 pb-2">
                    <div className="text-[8.5px] font-bold text-slate-500 uppercase">
                      {companyName} · {clientName} · {docCode}
                    </div>
                    <h2 className="text-base font-black text-slate-900">
                      04. Plano de Ação &amp; Recomendações Prioritárias
                    </h2>
                  </div>

                  <div className="space-y-1.5 my-auto text-[9px]">
                    <div className="bg-white p-2 rounded border border-slate-200 flex items-start gap-2">
                      <span className="font-bold px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px]">P1</span>
                      <div>
                        <strong className="text-slate-900 block">Tuning de Histerese nos 5 Maiores Ofensores</strong>
                        <span className="text-slate-600">Aplicação de expressões de recuperação (Recovery Expression) no Zabbix 7.0.</span>
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200 flex items-start gap-2">
                      <span className="font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white text-[8px]">P2</span>
                      <div>
                        <strong className="text-slate-900 block">Mitigação de Ruído em Alarmes Curtos (&lt; 5m)</strong>
                        <span className="text-slate-600">Inserção de janelas de persistência de 3 a 5 minutos antes do disparo.</span>
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200 flex items-start gap-2">
                      <span className="font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white text-[8px]">P3</span>
                      <div>
                        <strong className="text-slate-900 block">Mapeamento de Dependências Zabbix</strong>
                        <span className="text-slate-600">Blindagem contra tempestade de alarmes em falhas de infraestrutura central.</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[8px] text-slate-400 border-t border-slate-200 pt-1">
                    Aprovado por: {author}
                  </div>
                </div>
              )}

              {/* SLIDE: SEVERIDADE (Técnico) */}
              {currentSlide.id === 'severity' && (
                <div className="h-full bg-slate-50 p-5 flex flex-col justify-between">
                  <div className="border-b border-slate-200 pb-2">
                    <div className="text-[8.5px] font-bold text-slate-500 uppercase">
                      {companyName} · {clientName} · {docCode}
                    </div>
                    <h2 className="text-base font-black text-slate-900">
                      05. Distribuição por Severidade Zabbix
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-auto">
                    <div className="bg-white p-2 rounded border border-slate-200 space-y-1">
                      <div className="flex justify-between font-bold text-red-600 text-[10px]">
                        <span>Desastre</span>
                        <span>{severityCounts.Desastre}</span>
                      </div>
                      <div className="flex justify-between font-bold text-orange-600 text-[10px]">
                        <span>Alto</span>
                        <span>{severityCounts.Alto}</span>
                      </div>
                      <div className="flex justify-between font-bold text-amber-600 text-[10px]">
                        <span>Médio</span>
                        <span>{severityCounts.Médio}</span>
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200 space-y-1">
                      <div className="flex justify-between font-bold text-blue-600 text-[10px]">
                        <span>Aviso</span>
                        <span>{severityCounts.Aviso}</span>
                      </div>
                      <div className="flex justify-between font-bold text-emerald-600 text-[10px]">
                        <span>Informação</span>
                        <span>{severityCounts.Informação}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-700 text-[10px]">
                        <span>Total de Eventos</span>
                        <span>{kpis.totalEventos}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[8px] text-slate-400 border-t border-slate-200 pt-1">
                    Mapeamento Técnico de Riscos
                  </div>
                </div>
              )}

              {/* SLIDE: CALIBRAÇÃO (Técnico) */}
              {currentSlide.id === 'tuning' && (
                <div className="h-full bg-slate-50 p-5 flex flex-col justify-between">
                  <div className="border-b border-slate-200 pb-2">
                    <div className="text-[8.5px] font-bold text-slate-500 uppercase">
                      {companyName} · {clientName} · {docCode}
                    </div>
                    <h2 className="text-base font-black text-slate-900">
                      06. Calibração de Triggers Zabbix 7.0
                    </h2>
                  </div>

                  <div className="space-y-1.5 my-auto text-[8.5px] font-mono">
                    <div className="bg-white p-1.5 rounded border border-slate-200">
                      <div className="font-bold text-slate-900">CPU Saturação (system.cpu.util)</div>
                      <div className="text-red-600">Problem: min(/HOST/system.cpu.util, 5m) &gt; 90</div>
                      <div className="text-emerald-600">Recovery: max(/HOST/system.cpu.util, 10m) &lt; 70</div>
                    </div>
                    <div className="bg-white p-1.5 rounded border border-slate-200">
                      <div className="font-bold text-slate-900">Queda Link ICMP (icmpping)</div>
                      <div className="text-red-600">Problem: max(/HOST/icmpping, 3m) = 0</div>
                      <div className="text-emerald-600">Recovery: min(/HOST/icmpping, 3m) = 1</div>
                    </div>
                  </div>

                  <div className="text-[8px] text-slate-400 border-t border-slate-200 pt-1">
                    Homologação SNOC Zabbix 7.0
                  </div>
                </div>
              )}

              {/* SLIDE: APÊNDICE DE PROMPT IA (Book de Resultados) */}
              {currentSlide.id === 'prompt_appendix' && (
                <div className="h-full bg-slate-900 p-5 flex flex-col justify-between text-slate-200">
                  <div className="border-b border-slate-800 pb-2">
                    <div className="text-[8.5px] font-bold text-slate-400 uppercase">
                      {companyName} · {clientName} · {docCode}
                    </div>
                    <h2 className="text-base font-black text-white">
                      06. Apêndice Metodológico: Engenharia de Prompt IA
                    </h2>
                  </div>

                  <div className="my-auto space-y-2">
                    <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700 text-[9.5px]">
                      <div className="font-bold text-amber-400 uppercase text-[8.5px] mb-1">
                        Metodologia &amp; Rastreabilidade de Auditoria
                      </div>
                      <p className="text-slate-300 leading-relaxed text-[8.5px]">
                        Diagnóstico processado com base estrita no dataset auditado ({kpis.totalEventos} incidentes, {shortPct}% de ruído transitório). O prompt estruturado consolida regras ITIL v4 e engenharia cirúrgica de triggers Zabbix 7.0 LTS.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[8px] text-slate-300 max-h-[140px] overflow-hidden">
                      <div className="text-emerald-400 font-bold mb-1">ESPECIFICAÇÃO DO PROMPT DE AUDITORIA:</div>
                      <pre className="whitespace-pre-wrap">{compiledPrompt.slice(0, 360)}...</pre>
                    </div>
                  </div>

                  <div className="text-[8px] text-slate-500 border-t border-slate-800 pt-1">
                    Auditoria de Inteligência Zabbix 7.0 · SNOC Observability Suite
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Miniaturas Inferiores do Carrossel */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 px-1">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentSlideIndex(idx)}
                className={`shrink-0 p-2 rounded-xl text-left transition-all border cursor-pointer ${
                  currentSlideIndex === idx
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Slide {idx + 1}
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[110px]">
                  {s.title}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Formato:</span>
            <span>Microsoft PowerPoint (*.pptx)</span>
            <span>·</span>
            <span>Proporção 16:9</span>
            <span>·</span>
            <span>{slides.length} slides</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleDownloadPPTX}
              disabled={isExporting}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Gerando Apresentação...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar Apresentação (.pptx)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
