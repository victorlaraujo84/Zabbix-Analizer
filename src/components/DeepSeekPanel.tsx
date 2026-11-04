/**
 * DeepSeek AI Diagnostic Panel
 * Permite ao usuário acionar análise de causa raiz e tuning com a DeepSeek API ou especialista analítico.
 */

import React, { useState, useMemo } from 'react';
import { ZabbixEvent, ZabbixKPIs, ZabbixFilters, ClientTriggerCatalog } from '../types/zabbix';
import { runDeepSeekAnalysis, DeepSeekAnalysisResult, ReportTheme } from '../utils/deepseek';
import {
  generateTriggerTuningPrompt,
  generateExecutiveReportPrompt,
  generateBookDeResultadosPrompt,
} from '../utils/analytics';
import { marked } from 'marked';
import {
  Sparkles,
  Bot,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  FileText,
  Wrench,
  Briefcase,
  Code2,
  BookOpen,
} from 'lucide-react';

interface DeepSeekPanelProps {
  events: ZabbixEvent[];
  kpis: ZabbixKPIs;
  filters: ZabbixFilters;
  clientName?: string;
  onOpenReportModal?: (aiNarrative?: string) => void;
  onOpenSettings?: () => void;
  triggerCatalog?: ClientTriggerCatalog | null;
}

export const DeepSeekPanel: React.FC<DeepSeekPanelProps> = ({
  events,
  kpis,
  filters,
  clientName,
  onOpenReportModal,
  onOpenSettings,
  triggerCatalog,
}) => {
  const [panelTheme, setPanelTheme] = useState<ReportTheme>('tecnico');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DeepSeekAnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPromptDrawerOpen, setIsPromptDrawerOpen] = useState(false);
  const [customDirectives, setCustomDirectives] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);

  const compiledPrompt = useMemo(() => {
    if (panelTheme === 'book_resultados') {
      return generateBookDeResultadosPrompt(
        events,
        kpis,
        filters,
        events.length,
        triggerCatalog,
        customDirectives
      );
    }
    if (panelTheme === 'executivo') {
      const p = generateExecutiveReportPrompt(events, kpis, filters, events.length);
      return customDirectives ? `${p}\n\n### DIRETRIZES DO AUDITOR:\n${customDirectives}` : p;
    }
    const p = generateTriggerTuningPrompt(events, kpis, filters, events.length, triggerCatalog);
    return customDirectives ? `${p}\n\n### DIRETRIZES DO AUDITOR:\n${customDirectives}` : p;
  }, [panelTheme, events, kpis, filters, triggerCatalog, customDirectives]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(compiledPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleGenerate = async (themeToUse: ReportTheme = panelTheme) => {
    setIsExpanded(true);
    setIsLoading(true);
    setResult(null);

    try {
      const res = await runDeepSeekAnalysis(
        events,
        kpis,
        filters,
        clientName,
        themeToUse,
        undefined,
        triggerCatalog,
        undefined,
        customDirectives
      );
      setResult(res);
    } catch (err: any) {
      setResult({
        markdown: `Erro ao executar análise: ${err.message}`,
        source: 'offline_expert',
        modelUsed: 'Falha',
        error: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.markdown) return;
    navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const renderedHtml = result?.markdown ? marked.parse(result.markdown) : '';

  return (
    <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/50 via-white to-sky-50/40 dark:from-slate-900 dark:via-slate-900/90 dark:to-indigo-950/30 shadow-xs overflow-hidden transition-all">
      {/* Barra de Cabeçalho do Painel */}
      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                Diagnóstico &amp; Tuning Inteligente com IA
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                DeepSeek Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Análise profunda de ruído operacional, expressões de histerese e supressão de alarmes para {clientName || 'o escopo ativo'}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Tema Rápido */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-200/60 dark:bg-slate-800 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => {
                setPanelTheme('tecnico');
                if (result) handleGenerate('tecnico');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                panelTheme === 'tecnico'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3 h-3" />
              <span>Técnico</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPanelTheme('executivo');
                if (result) handleGenerate('executivo');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                panelTheme === 'executivo'
                  ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-3 h-3" />
              <span>Executivo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPanelTheme('book_resultados');
                if (result) handleGenerate('book_resultados');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                panelTheme === 'book_resultados'
                  ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              <span>Book de Resultados</span>
            </button>
          </div>

          {/* Botão de Inspecionar / Personalizar Prompt */}
          <button
            type="button"
            onClick={() => setIsPromptDrawerOpen(!isPromptDrawerOpen)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              isPromptDrawerOpen
                ? 'bg-slate-800 text-white border-slate-700 dark:bg-slate-700'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
            }`}
            title="Inspecionar e personalizar o prompt enviado para a IA"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-500" />
            <span>Prompt da IA</span>
          </button>

          <button
            type="button"
            onClick={() => handleGenerate(panelTheme)}
            disabled={isLoading || events.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-lg shadow-xs transition-all cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processando IA...</span>
              </>
            ) : (
              <>
                <Bot className="w-3.5 h-3.5" />
                <span>{result ? 'Regerar Diagnóstico' : 'Analisar com IA'}</span>
              </>
            )}
          </button>

          {result && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title={isExpanded ? 'Recolher' : 'Expandir'}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Gaveta de Inspeção e Personalização do Prompt */}
      {isPromptDrawerOpen && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Prompt Compilado para Modelo {panelTheme === 'book_resultados' ? 'Book de Resultados' : panelTheme === 'executivo' ? 'Executivo' : 'Técnico'}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                ({compiledPrompt.length} caracteres)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                {promptCopied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-400" />
                    <span>Copiar Prompt</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsPromptDrawerOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>

          {/* Campo de Diretrizes Customizadas */}
          <div className="mb-3">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
              Diretrizes &amp; Instruções Personalizadas do Auditor (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ex: Focar na indisponibilidade do banco Oracle durante fechamento contábil e propor histerese de 10 minutos."
              value={customDirectives}
              onChange={(e) => setCustomDirectives(e.target.value)}
              className="w-full text-xs px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          {/* Prévia do Prompt */}
          <div className="max-h-56 overflow-y-auto rounded-lg bg-slate-900 text-slate-200 p-3 font-mono text-[11px] leading-relaxed border border-slate-800 select-text">
            <pre className="whitespace-pre-wrap break-words">{compiledPrompt}</pre>
          </div>
        </div>
      )}

      {/* Área expandida com o conteúdo formatado */}
      {isExpanded && (
        <div className="border-t border-indigo-100 dark:border-indigo-950 p-4 sm:p-6 bg-white/70 dark:bg-slate-900/70">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Avaliando {events.length} incidentes e calculando expressões de histerese...
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Identificando flapping de itens e gerando sintaxes Zabbix 6/7.
              </p>
            </div>
          )}

          {result && !isLoading && (
            <div>
              {/* Barra de Status do Modelo */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Modelo:</span>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    {result.modelUsed}
                  </span>
                  {result.source === 'offline_expert' && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Modo Local / Configure a API em Configurações</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
                  </button>

                  {onOpenReportModal && (
                    <button
                      type="button"
                      onClick={() => onOpenReportModal(result.markdown)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-500 text-white hover:bg-amber-600 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Incluir no Relatório PDF</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Renderização em Markdown Estilizada */}
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 text-xs leading-relaxed space-y-3 font-sans [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-slate-900 dark:[&_h3]:text-white [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:text-xs [&_h4]:font-bold [&_h4]:text-slate-800 dark:[&_h4]:text-slate-200 [&_h4]:mt-3 [&_h4]:mb-1 [&_pre]:bg-slate-950 [&_pre]:text-emerald-400 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:font-mono [&_pre]:text-[11px] [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-indigo-600 dark:[&_code]:text-indigo-400 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: renderedHtml as string }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
