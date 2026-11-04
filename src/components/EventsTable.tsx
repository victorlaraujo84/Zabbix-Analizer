import React, { useState, useMemo } from 'react';
import { ZabbixEvent, ClientTriggerCatalog, ZabbixTriggerCatalogItem } from '../types/zabbix';
import { SEVERITY_COLORS, findTriggerExpression } from '../utils/analytics';
import { exportToCSV } from '../utils/analytics';
import { formatDateTimeBR } from '../utils/parser';
import {
  Download,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Tag,
  Code2,
  Copy,
  CheckCheck,
  X,
  Sparkles,
  ShieldCheck,
  FileDown,
} from 'lucide-react';
import { exportEventsTableToPDF } from '../utils/tablePdfExport';

interface EventsTableProps {
  events: ZabbixEvent[];
  totalRaw: number;
  triggerCatalog?: ClientTriggerCatalog | null;
  onValidateExpression?: (expr: string, triggerName?: string, hostName?: string) => void;
  clientName?: string;
  companyName?: string;
  activeFilters?: any;
}

type SortField =
  | 'severidade'
  | 'hora'
  | 'horaRecuperacao'
  | 'status'
  | 'host'
  | 'incidente'
  | 'duracaoSegundos'
  | 'reconhecido';

export const EventsTable: React.FC<EventsTableProps> = ({
  events,
  totalRaw,
  triggerCatalog,
  onValidateExpression,
  clientName,
  companyName,
  activeFilters,
}) => {
  const [tableSearch, setTableSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('hora');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [activeExprModal, setActiveExprModal] = useState<ZabbixTriggerCatalogItem | null>(null);
  const [copiedExprId, setCopiedExprId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedExprId(id);
    setTimeout(() => setCopiedExprId(null), 2000);
  };

  const handleExportPDF = () => {
    if (processedEvents.length === 0) return;
    setIsExportingPdf(true);
    setExportFeedback(null);
    try {
      exportEventsTableToPDF({
        events: processedEvents,
        clientName: clientName || 'Cliente Corporativo',
        companyName: companyName || 'SNOC Observability Suite',
        activeFilters,
        totalRawEvents: totalRaw,
      });
      setExportFeedback(`Relatório em PDF com ${processedEvents.length} eventos exportado com sucesso!`);
      setTimeout(() => setExportFeedback(null), 3500);
    } catch (err: any) {
      alert(`Erro ao gerar PDF da tabela: ${err.message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Ordenação e busca local adicional se digitado na tabela
  const processedEvents = useMemo(() => {
    let result = [...events];

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      result = result.filter(
        (e) =>
          e.host.toLowerCase().includes(q) ||
          e.incidente.toLowerCase().includes(q) ||
          e.etiquetasTexto.toLowerCase().includes(q) ||
          e.severidade.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'hora': {
          const tA = a.dataInicio ? a.dataInicio.getTime() : 0;
          const tB = b.dataInicio ? b.dataInicio.getTime() : 0;
          comparison = tA - tB;
          break;
        }
        case 'horaRecuperacao': {
          const tA = a.dataFim ? a.dataFim.getTime() : 0;
          const tB = b.dataFim ? b.dataFim.getTime() : 0;
          comparison = tA - tB;
          break;
        }
        case 'duracaoSegundos':
          comparison = a.duracaoSegundos - b.duracaoSegundos;
          break;
        case 'severidade':
          comparison = a.severidade.localeCompare(b.severidade);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'host':
          comparison = a.host.localeCompare(b.host);
          break;
        case 'incidente':
          comparison = a.incidente.localeCompare(b.incidente);
          break;
        case 'reconhecido':
          comparison = a.reconhecido.localeCompare(b.reconhecido);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [events, tableSearch, sortField, sortDirection]);

  // Paginação
  const totalPages = Math.ceil(processedEvents.length / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedRows = processedEvents.slice(startIndex, startIndex + pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600 inline ml-1" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-red-600 dark:text-red-400 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-red-600 dark:text-red-400 inline ml-1" />
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
      {/* Barra de Ferramentas Superior */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Tabela Detalhada de Incidentes
          </h3>
          <span className="text-xs font-mono text-slate-400 dark:text-slate-500 tabular-nums">
            Exibindo {processedEvents.length} de {totalRaw} eventos
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Busca na tabela */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Pesquisar em host, incidente, tag..."
              value={tableSearch}
              onChange={(e) => {
                setTableSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-red-500"
            />
          </div>

          {/* Exportar CSV */}
          <button
            onClick={() => exportToCSV(processedEvents)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            title="Exportar dados filtrados em formato CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Exportar CSV</span>
          </button>

          {/* Exportar PDF Formatado (A4 Paisagem) */}
          <button
            onClick={handleExportPDF}
            disabled={isExportingPdf || processedEvents.length === 0}
            title="Exportar todos os eventos filtrados em PDF formatado (A4 Paisagem)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-900 dark:text-red-100 bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900/60 border border-red-300 dark:border-red-800 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isExportingPdf ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin" />
                <span>Gerando PDF...</span>
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                <span>Exportar PDF ({processedEvents.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Banner de Feedback de Exportação */}
      {exportFeedback && (
        <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{exportFeedback}</span>
          </div>
          <button
            onClick={() => setExportFeedback(null)}
            className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Tabela com rolagem horizontal */}
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 select-none bg-slate-50/50 dark:bg-slate-800/20">
              <th
                onClick={() => handleSort('severidade')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
              >
                Severidade {renderSortIcon('severidade')}
              </th>
              <th
                onClick={() => handleSort('hora')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
              >
                Hora {renderSortIcon('hora')}
              </th>
              <th
                onClick={() => handleSort('horaRecuperacao')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
              >
                Recuperação {renderSortIcon('horaRecuperacao')}
              </th>
              <th
                onClick={() => handleSort('status')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
              >
                Status {renderSortIcon('status')}
              </th>
              <th
                onClick={() => handleSort('host')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
              >
                Host {renderSortIcon('host')}
              </th>
              <th
                onClick={() => handleSort('incidente')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white min-w-[240px]"
              >
                Incidente {renderSortIcon('incidente')}
              </th>
              <th
                onClick={() => handleSort('duracaoSegundos')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white text-right"
              >
                Duração {renderSortIcon('duracaoSegundos')}
              </th>
              <th
                onClick={() => handleSort('reconhecido')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white text-center"
              >
                Ack {renderSortIcon('reconhecido')}
              </th>
              <th className="py-2.5 px-3 text-center">Ações &amp; Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginatedRows.map((evt) => {
              const sevColor = SEVERITY_COLORS[evt.severidade] || '#757575';
              const isResolved = evt.status === 'RESOLVIDO';
              const isExpanded = expandedRowId === evt.id;
              const exprItem = findTriggerExpression(evt.host, evt.incidente, triggerCatalog);

              return (
                <React.Fragment key={evt.id}>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    {/* Severidade */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: sevColor }}
                        />
                        <span style={{ color: sevColor }}>{evt.severidade}</span>
                      </div>
                    </td>

                    {/* Hora Início */}
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTimeBR(evt.dataInicio)}
                    </td>

                    {/* Hora Recuperação */}
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {evt.dataFim ? (
                        formatDateTimeBR(evt.dataFim)
                      ) : (
                        <span className="text-red-500 font-semibold text-[10px]">Em aberto</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                          isResolved
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        }`}
                      >
                        {evt.status}
                      </span>
                    </td>

                    {/* Host */}
                    <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200 font-medium whitespace-nowrap">
                      {typeof evt.host === 'object' && evt.host !== null ? ((evt.host as any).host || String(evt.host)) : String(evt.host || '')}
                    </td>

                    {/* Incidente */}
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 max-w-sm" title={evt.incidente}>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{evt.incidente}</span>
                        {evt.expressao ? (
                          <button
                            type="button"
                            onClick={() =>
                              setActiveExprModal({
                                id: evt.id,
                                host: evt.host,
                                name: evt.incidente,
                                expression: evt.expressao!,
                              })
                            }
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900 cursor-pointer shrink-0 transition-colors"
                            title={`Expressão da Trigger: ${evt.expressao}`}
                          >
                            <Code2 className="w-3 h-3" />
                            <span>Expressão</span>
                          </button>
                        ) : exprItem ? (
                          <button
                            type="button"
                            onClick={() => setActiveExprModal(exprItem)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer shrink-0 transition-colors"
                            title="Ver expressão cadastrada na planilha do Zabbix"
                          >
                            <Code2 className="w-3 h-3" />
                            <span>fx</span>
                          </button>
                        ) : null}
                      </div>
                    </td>

                    {/* Duração */}
                    <td className="py-2 px-3 font-mono text-[11px] text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {evt.duracaoTexto}
                    </td>

                    {/* Reconhecido */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <span
                        className={`text-[11px] font-semibold ${
                          evt.reconhecido === 'Sim' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                        }`}
                      >
                        {evt.reconhecido}
                      </span>
                    </td>

                    {/* Toggle Detalhes */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setExpandedRowId(isExpanded ? null : evt.id)}
                        className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
                      >
                        {isExpanded ? 'Recolher' : 'Ver Tags'}
                      </button>
                    </td>
                  </tr>

                  {/* Linha expandida com Ações e Etiquetas */}
                  {isExpanded && (
                    <tr className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                      <td colSpan={9} className="py-3 px-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="font-semibold block text-slate-500 dark:text-slate-400 mb-1">
                              Ações Tomadas:
                            </span>
                            <p className="italic bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800">
                              {evt.acoes || 'Nenhuma ação registrada no Zabbix.'}
                            </p>
                          </div>
                          <div>
                            <span className="font-semibold block text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              Etiquetas (Tags):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(evt.etiquetas).length > 0 ? (
                                Object.entries(evt.etiquetas).map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="px-2 py-0.5 rounded text-[11px] bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono"
                                  >
                                    <strong className="text-slate-500 dark:text-slate-400">{k}:</strong> {v}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 italic">Sem etiquetas</span>
                              )}
                            </div>
                          </div>

                          {/* Bloco de Expressão Zabbix quando disponível */}
                          {exprItem && (
                            <div className="col-span-full pt-2 mt-2 border-t border-slate-200 dark:border-slate-700/80">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 text-xs">
                                  <Code2 className="w-3.5 h-3.5 text-blue-500" />
                                  <span>Expressão Zabbix (Catálogo do Cliente):</span>
                                </span>
                                <div className="flex items-center gap-2">
                                  {exprItem.parsedThreshold && (
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                      {exprItem.parsedThreshold}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(exprItem.id, exprItem.expression)}
                                    className="p-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    {copiedExprId === exprItem.id ? (
                                      <>
                                        <CheckCheck className="w-3 h-3 text-emerald-500" />
                                        <span className="text-emerald-500">Copiado</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copiar</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                              <pre className="p-2.5 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all border border-slate-800 leading-relaxed">
                                {exprItem.expression}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {paginatedRows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  Nenhum registro encontrado para os critérios de busca.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginação */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Linhas por página:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          <span className="font-mono tabular-nums">
            Página {safeCurrentPage} de {totalPages}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safeCurrentPage === 1}
            onClick={() => setCurrentPage(1)}
            className="p-1.5 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
            title="Primeira página"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={safeCurrentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-1.5 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
            title="Próxima página"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            className="p-1.5 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
            title="Última página"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modal Rápido de Expressão Zabbix */}
      {activeExprModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <button
              type="button"
              onClick={() => setActiveExprModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {activeExprModal.host}
              </span>
              <span className="font-semibold text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Code2 className="w-3.5 h-3.5" />
                Expressão Zabbix do Catálogo
              </span>
            </div>

            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              {activeExprModal.name}
            </h3>

            <div className="relative group mb-4">
              <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all border border-slate-800 leading-relaxed">
                {activeExprModal.expression}
              </pre>
              <button
                type="button"
                onClick={() => handleCopyText(activeExprModal.id, activeExprModal.expression)}
                className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                {copiedExprId === activeExprModal.id ? (
                  <>
                    <CheckCheck className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copiar Expressão</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {activeExprModal.parsedFunction && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                    Função: {activeExprModal.parsedFunction}
                  </span>
                )}
                {activeExprModal.parsedThreshold && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    Limiar: {activeExprModal.parsedThreshold}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {onValidateExpression && (
                  <button
                    type="button"
                    onClick={() => {
                      onValidateExpression(activeExprModal.expression, activeExprModal.name, activeExprModal.host);
                      setActiveExprModal(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Auditar no Validador</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (activeExprModal) {
                      try {
                        sessionStorage.setItem(
                          'zabbix_factory_target',
                          JSON.stringify({
                            host: activeExprModal.host,
                            trigger: activeExprModal.name,
                            problemExpr: activeExprModal.expression || '',
                            recoveryExpr: '',
                          })
                        );
                      } catch {
                        // ignora
                      }
                    }
                    setActiveExprModal(null);
                    window.location.hash = '#/trigger-factory';
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Otimizar na Fábrica</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveExprModal(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
