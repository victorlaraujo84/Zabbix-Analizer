/**
 * Histórico de Relatórios Técnicos Gerados & Governança de Laudos (Fase 3)
 * Permite visualizar histórico auditável, consultar snapshots de métricas/IA e baixar PDFs.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { SaaSReport, getReportsList, getReportPDFBlob, deleteReport } from '../utils/saasDB';
import { formatDuration } from '../utils/parser';
import {
  FileText,
  Download,
  Trash2,
  Calendar,
  Building2,
  ArrowLeft,
  Search,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Eye,
  CheckCircle2,
  Info,
  UserCheck,
  Layers,
  X,
  FileCode,
  Clock,
  Sparkles,
} from 'lucide-react';

interface ReportsViewProps {
  onBackToApp: () => void;
  onOpenReportModalWithData?: (report: SaaSReport) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ onBackToApp }) => {
  const [reports, setReports] = useState<SaaSReport[]>([]);
  const [search, setSearch] = useState('');
  const [themeFilter, setThemeFilter] = useState<'all' | 'executivo' | 'tecnico'>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<SaaSReport | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SaaSReport | null>(null);

  useEffect(() => {
    setReports(getReportsList());
  }, []);

  // Lista única de clientes presentes nos relatórios
  const clientOptions = useMemo(() => {
    const clients = new Set<string>();
    reports.forEach((r) => {
      if (r.clientName) clients.add(r.clientName);
    });
    return Array.from(clients).sort();
  }, [reports]);

  const handleDownloadPDF = async (report: SaaSReport) => {
    setDownloadingId(report.id);
    try {
      const blob = await getReportPDFBlob(report.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const themeSlug = report.reportTheme === 'executivo' ? 'Executivo' : 'Tecnico';
        a.download = `Relatorio_${themeSlug}_Zabbix_${report.clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${report.createdAt.slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        alert('O arquivo PDF deste relatório não está mais no cache IndexedDB deste navegador.');
      }
    } catch (err: any) {
      alert(`Falha ao obter PDF: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;
    await deleteReport(reportToDelete.id);
    setReports(getReportsList());
    if (selectedSnapshot?.id === reportToDelete.id) {
      setSelectedSnapshot(null);
    }
    setReportToDelete(null);
    setFeedback('Relatório removido do histórico com sucesso.');
    setTimeout(() => setFeedback(null), 3000);
  };

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      // Filtro de tema
      if (themeFilter !== 'all' && (r.reportTheme || 'tecnico') !== themeFilter) {
        return false;
      }
      // Filtro de cliente
      if (clientFilter !== 'all' && r.clientName !== clientFilter) {
        return false;
      }
      // Busca geral
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchClient = r.clientName.toLowerCase().includes(q);
        const matchFile = r.fileName.toLowerCase().includes(q);
        const matchHost = (r.kpis.topHost || '').toLowerCase().includes(q);
        const matchDoc = (r.documentCode || '').toLowerCase().includes(q);
        const matchElab = (r.elaborator || '').toLowerCase().includes(q);
        if (!matchClient && !matchFile && !matchHost && !matchDoc && !matchElab) {
          return false;
        }
      }
      return true;
    });
  }, [reports, search, themeFilter, clientFilter]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Barra Superior */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToApp}
              className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              title="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                <span>Histórico de Laudos &amp; Governança de Relatórios</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Consulte versões de relatórios emitidos, auditoria de revisões, snapshots de IA e arquivos PDF.
              </p>
            </div>
          </div>

          <button
            onClick={onBackToApp}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-xs cursor-pointer"
          >
            Gerar Novo Relatório no Dashboard
          </button>
        </div>

        {feedback && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
            {feedback}
          </div>
        )}

        {/* Barra de Filtros e Busca */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Abas de Tema */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setThemeFilter('all')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  themeFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todos ({reports.length})
              </button>
              <button
                type="button"
                onClick={() => setThemeFilter('executivo')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  themeFilter === 'executivo'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                👔 Executivos ({reports.filter((r) => r.reportTheme === 'executivo').length})
              </button>
              <button
                type="button"
                onClick={() => setThemeFilter('tecnico')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  themeFilter === 'tecnico'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🛠️ Técnicos ({reports.filter((r) => (r.reportTheme || 'tecnico') === 'tecnico').length})
              </button>
            </div>

            {/* Filtro por Cliente */}
            {clientOptions.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Building2 className="w-4 h-4 text-slate-400" />
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden"
                >
                  <option value="all">Todos os Clientes</option>
                  {clientOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Campo de Busca */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, documento ou autor..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Tabela de Relatórios */}
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhum relatório encontrado</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {reports.length === 0
                ? 'Ao abrir o dashboard e clicar em "Relatório PDF", os laudos gerados com as métricas de MTTR, MTBF e tuning serão salvos aqui com snapshot auditável.'
                : 'Nenhum laudo corresponde aos filtros de busca selecionados.'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <th className="py-3 px-4">Documento / Cliente</th>
                    <th className="py-3 px-4">Modelo</th>
                    <th className="py-3 px-4">Data Emissão</th>
                    <th className="py-3 px-4">Elaborador / Aprovador</th>
                    <th className="py-3 px-4 text-center">Eventos</th>
                    <th className="py-3 px-4 text-center">Ruído (&lt;5m)</th>
                    <th className="py-3 px-4 text-center">MTTR Médio</th>
                    <th className="py-3 px-4 text-center">Host Crítico</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((rep) => (
                    <tr key={rep.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5 text-xs text-slate-900 dark:text-white">
                            <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            {rep.clientName}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {rep.documentCode || 'REL.SNOC.001'} {rep.revision ? `· Rev ${rep.revision}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            rep.reportTheme === 'executivo'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          }`}
                        >
                          {rep.reportTheme === 'executivo' ? '👔 Executivo' : '🛠️ Técnico'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{new Date(rep.createdAt).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[170px]">
                        <span className="block font-medium text-slate-700 dark:text-slate-300">
                          {rep.elaborator || 'Equipe Observabilidade'}
                        </span>
                        <span className="block text-[10px] text-slate-400 truncate">
                          Aprov: {rep.approver || 'Gerência NOC'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800 dark:text-slate-200">
                        {rep.kpis.totalEvents}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {rep.kpis.shortDurationPct}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-700 dark:text-slate-300">
                        {formatDuration(rep.kpis.mttrSec)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                        {rep.kpis.topHost || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Visualizar Snapshot */}
                          <button
                            type="button"
                            onClick={() => setSelectedSnapshot(rep)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer transition-colors"
                            title="Ver Snapshot Auditável do Laudo"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-500" />
                            <span className="hidden sm:inline">Snapshot</span>
                          </button>

                          {rep.pdfStored && (
                            <button
                              type="button"
                              onClick={() => handleDownloadPDF(rep)}
                              disabled={downloadingId === rep.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                              title="Baixar PDF Original"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{downloadingId === rep.id ? '...' : 'PDF'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setReportToDelete(rep)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer transition-colors"
                            title="Remover Registro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal de Detalhes / Snapshot Auditável do Laudo */}
        {selectedSnapshot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 my-6 max-h-[90vh] flex flex-col">
              <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                        Snapshot Auditável do Laudo
                      </h2>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          selectedSnapshot.reportTheme === 'executivo'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}
                      >
                        {selectedSnapshot.reportTheme === 'executivo' ? '👔 Executivo' : '🛠️ Técnico'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      {selectedSnapshot.documentCode || 'REL.SNOC.001'} · Rev {selectedSnapshot.revision || '0'} · {selectedSnapshot.clientName}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSnapshot(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Conteúdo do Snapshot */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
                {/* Metadados de Auditoria */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Data de Emissão</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(selectedSnapshot.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Elaborador</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedSnapshot.elaborator || 'Equipe de Observabilidade'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Aprovador</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedSnapshot.approver || 'Gerência de NOC'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Arquivo Origem</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 truncate block">
                      {selectedSnapshot.fileName}
                    </span>
                  </div>
                </div>

                {/* Métricas Congeladas do Período */}
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Métricas Congeladas no Momento da Emissão
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block">Total de Eventos</span>
                      <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                        {selectedSnapshot.kpis.totalEvents}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block">Ruído (&lt; 5m)</span>
                      <span className="text-base font-bold font-mono text-red-600 dark:text-red-400">
                        {selectedSnapshot.kpis.shortDurationPct}%
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block">MTTR Médio</span>
                      <span className="text-base font-bold font-mono text-blue-600 dark:text-blue-400">
                        {formatDuration(selectedSnapshot.kpis.mttrSec)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block">MTBF Global</span>
                      <span className="text-base font-bold font-mono text-cyan-600 dark:text-cyan-400">
                        {formatDuration(selectedSnapshot.kpis.mtbfSec)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block">Host Crítico</span>
                      <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200 truncate block">
                        {typeof selectedSnapshot.kpis?.topHost === 'object' && selectedSnapshot.kpis?.topHost !== null
                          ? ((selectedSnapshot.kpis.topHost as any).host || '—')
                          : (selectedSnapshot.kpis?.topHost || '—')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notas Operacionais Inseridas */}
                {selectedSnapshot.operationalNotes && selectedSnapshot.operationalNotes.length > 0 && (
                  <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60">
                    <span className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 mb-1 text-[11px]">
                      <Info className="w-3.5 h-3.5" /> Particularidades &amp; Contexto Operacional Inserido:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-700 dark:text-slate-300 text-[11px]">
                      {selectedSnapshot.operationalNotes.map((note, nIdx) => (
                        <li key={nIdx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Parecer Narrativo da IA */}
                {selectedSnapshot.narrative?.markdown && (
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Diagnóstico e Recomendações Estruturadas (Snapshot IA)
                    </h3>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                      {selectedSnapshot.narrative.markdown}
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé do Modal */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setReportToDelete(selectedSnapshot)}
                  className="px-3 py-1.5 text-xs text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir Registro
                </button>

                <div className="flex items-center gap-2">
                  {selectedSnapshot.pdfStored && (
                    <button
                      type="button"
                      onClick={() => handleDownloadPDF(selectedSnapshot)}
                      disabled={downloadingId === selectedSnapshot.id}
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>{downloadingId === selectedSnapshot.id ? 'Baixando...' : 'Baixar Arquivo PDF Original'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedSnapshot(null)}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Exclusão */}
        {reportToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                Excluir Laudo do Histórico?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Você está prestes a remover o laudo de <strong>{reportToDelete.clientName}</strong> emitido em{' '}
                {new Date(reportToDelete.createdAt).toLocaleDateString()}. O arquivo PDF em cache também será liberado.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReportToDelete(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer shadow-xs"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
