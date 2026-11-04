import React from 'react';
import { Lightbulb, FileText, Zap, Presentation } from 'lucide-react';

interface ExecutiveSummaryProps {
  insights: string[];
  onOpenExecutivePrompt: () => void;
  onOpenTuningPrompt: () => void;
  onOpenReportModal?: () => void;
  onOpenPresentationModal?: () => void;
}

export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  insights,
  onOpenExecutivePrompt,
  onOpenTuningPrompt,
  onOpenReportModal,
  onOpenPresentationModal,
}) => {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-6 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Resumo Executivo · Diagnósticos Principais
          </h3>
        </div>

        {/* Botões para Prompts de IA e Relatório POP */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenTuningPrompt}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg transition-colors cursor-pointer shadow-xs"
            title="Copiar prompt com triggers de ruído para IA propor ajustes"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>Tuning de Triggers (Ruído)</span>
          </button>

          <button
            onClick={onOpenExecutivePrompt}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700/80 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors cursor-pointer shadow-xs"
            title="Copiar prompt consolidado para IA redigir relatório executivo formal"
          >
            <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span>Copiar Prompt Executivo</span>
          </button>

          {onOpenReportModal && (
            <button
              onClick={onOpenReportModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all cursor-pointer shadow-xs active:scale-95"
              title="Abrir gerador de Relatório Técnico com análise de IA pré-carregada"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-300" />
              <span>Gerar Relatório Técnico</span>
            </button>
          )}
          {onOpenPresentationModal && (
            <button
              onClick={onOpenPresentationModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-all cursor-pointer shadow-xs active:scale-95"
              title="Exportar Apresentação Executiva em PowerPoint Widescreen 16:9 (*.pptx)"
            >
              <Presentation className="w-3.5 h-3.5" />
              <span>Apresentação PPTX</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {insights.map((insight, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs leading-relaxed text-slate-700 dark:text-slate-300"
          >
            <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500 shrink-0">
              0{idx + 1}.
            </span>
            <p>{insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
