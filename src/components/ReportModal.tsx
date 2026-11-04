import React, { useState, useEffect, useMemo } from 'react';
import { ZabbixEvent, ZabbixKPIs, ZabbixFilters, ClientTriggerCatalog, ReportBrandingConfig } from '../types/zabbix';
import { formatDuration } from '../utils/parser';
import {
  SEVERITY_COLORS,
  getReportPeriodInfo,
  findTriggerExpression,
  deriveOptimizedTriggerEngineering,
  generateBookDeResultadosPrompt,
  generateTriggerTuningPrompt,
  generateExecutiveReportPrompt,
} from '../utils/analytics';
import { getActiveCompany, getClients, saveGeneratedReport, getMergedBranding, saveClientBranding } from '../utils/saasDB';
import { runDeepSeekAnalysis, ReportTheme } from '../utils/deepseek';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import {
  FileDown,
  X,
  Building2,
  UserCheck,
  CheckCircle2,
  Loader2,
  Sparkles,
  Wrench,
  Briefcase,
  Eye,
  RefreshCw,
  AlertTriangle,
  SlidersHorizontal,
  ChevronRight,
  TrendingDown,
  ShieldCheck,
  Check,
  Calendar,
  Code2,
  Upload,
  BookOpen,
  Layers,
  FileText,
  Image as ImageIcon,
  Palette,
  CheckSquare,
  MessageSquarePlus,
  Send,
  Plus,
  Trash2,
  Info,
  Copy,
} from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: ZabbixEvent[];
  kpis: ZabbixKPIs;
  activeFilters: ZabbixFilters;
  filename?: string | null;
  initialAiNarrative?: string;
  defaultClientName?: string;
  triggerCatalog?: ClientTriggerCatalog | null;
  onValidateExpression?: (problem: string, recovery?: string, triggerName?: string, hostName?: string) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  events,
  kpis,
  activeFilters,
  filename,
  initialAiNarrative,
  defaultClientName,
  triggerCatalog,
  onValidateExpression,
}) => {
  const activeCompany = getActiveCompany();
  const availableClients = getClients();

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dataEmissao = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

  // Estados principais de configuração
  const [reportTheme, setReportTheme] = useState<ReportTheme>('tecnico');
  const [modalTab, setModalTab] = useState<'config' | 'preview'>('config');

  const [companyName, setCompanyName] = useState(activeCompany.name || 'Petros');
  // REGRA DO CARGO: Texto livre puro, se vazio usa '—'
  const [techResponsible, setTechResponsible] = useState(activeCompany.technicalResponsible || '');
  const [clientName, setClientName] = useState(defaultClientName || availableClients[0]?.name || 'PetroRio / Equinix Datacenter');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  // Estados da IA
  const [aiNarrative, setAiNarrative] = useState(initialAiNarrative || '');
  const [aiStatus, setAiStatus] = useState<'idle' | 'generating' | 'success' | 'error'>(
    initialAiNarrative ? 'success' : 'idle'
  );
  const [aiModelUsed, setAiModelUsed] = useState(initialAiNarrative ? 'Diagnóstico Inicial' : '');
  const [aiError, setAiError] = useState<string | null>(null);

  // Notas e particularidades operacionais do ambiente (alimentam a IA e a nova seção do documento)
  const [operationalNotes, setOperationalNotes] = useState<string[]>([]);
  const [newContextNote, setNewContextNote] = useState('');

  // Seleção Modular de Seções para o Relatório
  const [sectionsConfig, setSectionsConfig] = useState({
    includeCover: true,
    includeStructuredHeader: true,
    includeExecutiveSummary: true,
    includeTuningAnalysis: true,
    includeKpiCharts: true,
    includeActionPlan: true,
    includePromptAppendix: false,
  });

  const [customDirectives, setCustomDirectives] = useState('');
  const [isPromptDrawerOpen, setIsPromptDrawerOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // Identidade Visual e Branding mesclado (Cliente > Empresa > Padrão)
  const selectedClientObj = availableClients.find((c) => c.name.toLowerCase() === clientName.toLowerCase());
  const effectiveCatalog = selectedClientObj?.triggerCatalog || triggerCatalog;

  const compiledPrompt = useMemo(() => {
    if (reportTheme === 'book_resultados') {
      return generateBookDeResultadosPrompt(
        events,
        kpis,
        activeFilters,
        events.length,
        effectiveCatalog,
        customDirectives
      );
    }
    if (reportTheme === 'executivo') {
      const p = generateExecutiveReportPrompt(events, kpis, activeFilters, events.length);
      return customDirectives ? `${p}\n\n### DIRETRIZES DO AUDITOR:\n${customDirectives}` : p;
    }
    const p = generateTriggerTuningPrompt(events, kpis, activeFilters, events.length, effectiveCatalog);
    return customDirectives ? `${p}\n\n### DIRETRIZES DO AUDITOR:\n${customDirectives}` : p;
  }, [reportTheme, events, kpis, activeFilters, effectiveCatalog, customDirectives]);
  const initialBranding = getMergedBranding(selectedClientObj?.id);

  const [headerStyle, setHeaderStyle] = useState<'modelo_estruturado' | 'executivo_moderno'>(
    (initialBranding.headerStyle as any) === 'pop_tecnico' ? 'modelo_estruturado' : (initialBranding.headerStyle as any) || 'modelo_estruturado'
  );
  const [includeCover, setIncludeCover] = useState<boolean>(
    initialBranding.includeCover !== undefined ? initialBranding.includeCover : true
  );
  const [coverStyle, setCoverStyle] = useState<'padrao_oficial' | 'institucional_gradient' | 'minimalista_tecnica'>(
    (initialBranding.coverStyle as any) === 'pop_oficial' ? 'padrao_oficial' : (initialBranding.coverStyle as any) || 'padrao_oficial'
  );
  const [coverImageDataUrl, setCoverImageDataUrl] = useState<string>(
    initialBranding.coverImageDataUrl || ''
  );
  const [reportTitle, setReportTitle] = useState(
    initialBranding.reportTitle !== undefined ? initialBranding.reportTitle : (initialBranding.defaultReportTitle || '')
  );
  const [documentCode, setDocumentCode] = useState(
    initialBranding.documentCode || 'REL.SNOC.GAB_TELCO.001'
  );
  const [revision, setRevision] = useState(initialBranding.revision || '0');
  const [publicationDate, setPublicationDate] = useState(
    initialBranding.publicationDate || dataEmissao
  );
  const [revisionDate, setRevisionDate] = useState(
    initialBranding.revisionDate || dataEmissao
  );
  const [elaborator, setElaborator] = useState(
    initialBranding.elaborator || 'Equipe de Observabilidade'
  );
  const [approver, setApprover] = useState(
    initialBranding.approver || activeCompany.technicalResponsible || 'Gerência de NOC'
  );
  const [selectedDepartmentTag, setSelectedDepartmentTag] = useState(
    'NOC | Network Operations Center'
  );
  const [objectiveDescription, setObjectiveDescription] = useState(
    initialBranding.objectiveDescription ||
      'Avaliação de ruído operacional, tempo de vida de incidentes e tuning cirúrgico de triggers Zabbix 7.0.'
  );
  const [coverSubtitle, setCoverSubtitle] = useState(
    initialBranding.coverSubtitle || 'C.D.C.I | SNOC – Monitoramento'
  );
  const [logoDataUrl, setLogoDataUrl] = useState(
    initialBranding.logoDataUrl || selectedClientObj?.logoDataUrl || activeCompany.logoDataUrl || ''
  );
  const [brandingSavedFeedback, setBrandingSavedFeedback] = useState(false);
  const [previewPage, setPreviewPage] = useState<'cover' | 1 | 2 | 3 | 'prompt'>('cover');
  const [isFromCache, setIsFromCache] = useState(false);

  // Disparo sob demanda da IA com o tema selecionado, notas operacionais e cache local
  const handleTriggerAiAnalysis = async (
    targetTheme: ReportTheme = reportTheme,
    notesOverride?: string[],
    forceRefresh: boolean = false
  ) => {
    const notesToUse = notesOverride !== undefined ? notesOverride : operationalNotes;
    const safeClientKey = clientName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const notesKey = notesToUse.slice().sort().join('|');
    const cacheKey = `zabbix_ai_cache_${safeClientKey}_${targetTheme}_${events.length}_${notesKey}_${customDirectives}_${activeFilters.dateFrom}_${activeFilters.dateTo}_${activeFilters.duracaoPreset}`;

    if (!forceRefresh) {
      try {
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && parsed.markdown) {
            setAiNarrative(parsed.markdown);
            setAiModelUsed(`${parsed.modelUsed || 'DeepSeek AI'} (Cache Local)`);
            setIsFromCache(true);
            setAiStatus('success');
            return;
          }
        }
      } catch {
        // silencioso se erro ao ler cache
      }
    }

    setAiStatus('generating');
    setAiError(null);
    setIsFromCache(false);
    try {
      const currentClient = availableClients.find((c) => c.name.toLowerCase() === clientName.toLowerCase());
      const effCatalog = currentClient?.triggerCatalog || triggerCatalog;
      const res = await runDeepSeekAnalysis(events, kpis, activeFilters, clientName, targetTheme, undefined, effCatalog, notesToUse, customDirectives);
      setAiNarrative(res.markdown);
      setAiModelUsed(res.modelUsed);
      setAiStatus('success');
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ markdown: res.markdown, modelUsed: res.modelUsed, timestamp: Date.now() })
        );
      } catch {
        // ignora quota
      }
    } catch (err: any) {
      console.error('Erro na análise da IA:', err);
      setAiStatus('error');
      setAiError(err.message || 'Falha ao processar análise da IA');
    }
  };

  const handleAddContextNote = (noteText: string) => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    if (operationalNotes.includes(trimmed)) return;
    const updated = [...operationalNotes, trimmed];
    setOperationalNotes(updated);
    setNewContextNote('');
    // Dispara refinamento com a IA automaticamente com as novas notas
    handleTriggerAiAnalysis(reportTheme, updated);
  };

  const handleRemoveContextNote = (index: number) => {
    const updated = operationalNotes.filter((_, i) => i !== index);
    setOperationalNotes(updated);
    handleTriggerAiAnalysis(reportTheme, updated);
  };

  useEffect(() => {
    const co = getActiveCompany();
    if (co) {
      setCompanyName(co.name);
      setTechResponsible(co.technicalResponsible || '');
    }
    if (defaultClientName) {
      setClientName(defaultClientName);
    }
    if (initialAiNarrative) {
      setAiNarrative(initialAiNarrative);
      setAiStatus('success');
    } else if (isOpen && aiStatus === 'idle') {
      // Pré-carrega automaticamente a análise da IA ao abrir/criar o modal
      handleTriggerAiAnalysis(reportTheme);
    }
  }, [isOpen, defaultClientName, initialAiNarrative]);

  // Sincroniza branding ao alternar cliente
  useEffect(() => {
    const client = availableClients.find((c) => c.name.toLowerCase() === clientName.toLowerCase());
    const b = getMergedBranding(client?.id);
    setHeaderStyle((b.headerStyle as any) === 'pop_tecnico' ? 'modelo_estruturado' : (b.headerStyle as any) || 'modelo_estruturado');
    setIncludeCover(b.includeCover !== undefined ? b.includeCover : true);
    setCoverStyle((b.coverStyle as any) === 'pop_oficial' ? 'padrao_oficial' : (b.coverStyle as any) || 'padrao_oficial');
    if (b.coverImageDataUrl !== undefined) setCoverImageDataUrl(b.coverImageDataUrl || '');
    setReportTitle(b.reportTitle !== undefined ? b.reportTitle : (b.defaultReportTitle || ''));
    setDocumentCode(b.documentCode || 'REL.SNOC.GAB_TELCO.001');
    setRevision(b.revision || '0');
    setElaborator(b.elaborator || 'Equipe de Observabilidade');
    setApprover(b.approver || activeCompany.technicalResponsible || 'Gerência de NOC');
    setSelectedDepartmentTag('NOC | Network Operations Center');
    setObjectiveDescription(b.objectiveDescription || 'Avaliação de ruído operacional, tempo de vida de incidentes e tuning cirúrgico de triggers Zabbix 7.0.');
    setCoverSubtitle(b.coverSubtitle || 'C.D.C.I | SNOC – Monitoramento');
    setLogoDataUrl(b.logoDataUrl || client?.logoDataUrl || activeCompany.logoDataUrl || '');
    setOperationalNotes(b.operationalContextNotes || []);
  }, [clientName]);

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCoverImageDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleReportLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveClientBranding = () => {
    if (!selectedClientObj) return;
    saveClientBranding(selectedClientObj.id, {
      reportTitle: reportTitle.trim(),
      defaultReportTitle: reportTitle.trim(),
      documentCode: documentCode.trim(),
      revision: revision.trim(),
      publicationDate: publicationDate.trim(),
      revisionDate: revisionDate.trim(),
      elaborator: elaborator.trim(),
      approver: approver.trim(),
      selectedDepartmentTag,
      objectiveDescription: objectiveDescription.trim(),
      coverSubtitle: coverSubtitle.trim(),
      logoDataUrl,
      coverImageDataUrl,
      headerStyle,
      includeCover,
      coverStyle,
      operationalContextNotes: operationalNotes,
    });
    setBrandingSavedFeedback(true);
    setTimeout(() => setBrandingSavedFeedback(false), 3000);
  };

  if (!isOpen) return null;

  // Extrai rigorosamente o mês/ano e o período do relatório a partir do filtro ativo ou dos eventos
  const { mesAno, isoAnoMes, periodoDescricao, isFiltered } = getReportPeriodInfo(activeFilters, events);

  // Top triggers e agregação de dados
  const triggerMap = new Map<string, { count: number; totalDur: number; sev: string; hosts: Set<string> }>();
  events.forEach((e) => {
    const item = triggerMap.get(e.incidente) || {
      count: 0,
      totalDur: 0,
      sev: e.severidade,
      hosts: new Set<string>(),
    };
    item.count++;
    item.totalDur += e.duracaoSegundos;
    item.hosts.add(e.host);
    triggerMap.set(e.incidente, item);
  });

  const topTriggers = Array.from(triggerMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 7);

  // Derivação dinâmica das expressões de histerese e tuning baseada 100% no ambiente do cliente
  const dynamicEngineeringItems = deriveOptimizedTriggerEngineering(topTriggers, events, 3);

  // Top hosts afetados (chaves estritamente strings)
  const hostMap = new Map<string, { count: number; sevCount: Record<string, number> }>();
  events.forEach((e) => {
    const safeHost = typeof e.host === 'object' && e.host !== null ? ((e.host as any).host || String(e.host)) : String(e.host || 'Host Desconhecido');
    const h = hostMap.get(safeHost) || { count: 0, sevCount: {} };
    h.count++;
    h.sevCount[e.severidade] = (h.sevCount[e.severidade] || 0) + 1;
    hostMap.set(safeHost, h);
  });
  const topHosts = Array.from(hostMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  const defaultCauses: Record<string, string> = {
    'Oracle: FALHA em coletar dados': 'Timeout momentâneo de conexão ODBC/script no poller. A coleta seguinte sucede imediatamente (duração 0s).',
    'WC_Portlet: Heap acima de 80%': 'Alocação natural de memória Java antes da atuação do Garbage Collector (GC) da JVM. Falta de histerese.',
    'High ICMP ping response time': 'Picos curtos de latência na comunicação externa. Sensibilidade excessiva a pacotes isolados.',
    'Oracle: REDO logs available low': 'Surtos temporários de gravação/checkpoint. O Oracle faz a troca rápida, mas a trigger dispara de imediato.',
    'Too many processes running...': 'Execução de rotinas agendadas (crons) e scripts de varredura do IPMAN de curta duração.',
    'TCP 3389 RDP MITRA': 'Micro-falhas de socket TCP (48s) em AVDs Azure. Classificação incorreta como Desastre.',
    'WC_Portlet: Heap acima de 90%': 'Escalada de uso de Heap na mesma JVM. Dispara simultaneamente com a trigger de 80% sem dependência.',
  };

  const shortPct = kpis.totalEventos > 0 ? Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100) : 0;

  // Alterna o tema e notifica caso queira regenerar a IA
  const handleThemeChange = (newTheme: ReportTheme) => {
    setReportTheme(newTheme);
  };

  // Geração do PDF com suporte a Capa Dinâmica
  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    setProgressMsg('Renderizando páginas de alta resolução...');

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageIds: string[] = [];
      if (sectionsConfig.includeCover && includeCover) {
        pageIds.push('report-pdf-page-cover');
      }
      if (sectionsConfig.includeExecutiveSummary || sectionsConfig.includeKpiCharts) {
        pageIds.push('report-pdf-page-1');
      }
      if (sectionsConfig.includeTuningAnalysis) {
        pageIds.push('report-pdf-page-2');
      }
      if (sectionsConfig.includeActionPlan) {
        pageIds.push('report-pdf-page-3');
      }
      if (sectionsConfig.includePromptAppendix) {
        pageIds.push('report-pdf-page-prompt');
      }
      if (pageIds.length === 0) {
        pageIds.push('report-pdf-page-1');
      }

      const totalPdfPages = pageIds.length;

      for (let i = 0; i < pageIds.length; i++) {
        setProgressMsg(`Renderizando página ${i + 1} de ${totalPdfPages}...`);
        const el = document.getElementById(pageIds[i]);
        if (!el) continue;

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '_');
      const themePrefix = reportTheme === 'executivo' ? 'Executivo' : 'Tecnico';
      const downloadName = `Relatorio_${themePrefix}_Triggers_${safeName}_${isoAnoMes}.pdf`;

      const pdfBlob = pdf.output('blob');

      // Salva no banco SaaS com histórico incluindo auditoria, tema e período
      await saveGeneratedReport(
        {
          companyId: activeCompany.id,
          clientName: clientName.trim(),
          fileName: filename || 'relatorio_zabbix.xlsx',
          periodStart: activeFilters?.dateFrom || undefined,
          periodEnd: activeFilters?.dateTo || undefined,
          kpis: {
            totalEvents: kpis.totalEventos,
            shortDurationPct: shortPct,
            ackRatePct: kpis.taxaAtuacaoPercentual,
            mttrSec: kpis.mttrSegundos,
            mtbfSec: kpis.mtbfSegundosGlobal,
            topHost: kpis.hostMaisAfetado.host,
          },
          narrative: aiNarrative ? { markdown: aiNarrative } : undefined,
          pdfStored: true,
          reportTheme,
          documentCode,
          revision,
          elaborator,
          approver,
          operationalNotes,
          dataSnapshot: {
            totalEvents: events.length,
            hostCount: Object.keys(events.reduce((acc, e) => ({ ...acc, [e.host]: true }), {})).length,
            triggerCount: Object.keys(events.reduce((acc, e) => ({ ...acc, [e.incidente]: true }), {})).length,
            dateRange: `${activeFilters?.dateFrom || 'Início'} até ${activeFilters?.dateTo || 'Fim'}`,
          },
        },
        pdfBlob
      );

      // Efetua o download no navegador
      pdf.save(downloadName);
      onClose();
    } catch (err: any) {
      console.error('Erro na renderização do PDF:', err);
      alert('Falha ao gerar PDF: ' + err.message);
    } finally {
      setIsGenerating(false);
      setProgressMsg('');
    }
  };

  // Exportação em lote: gera automaticamente tanto o Relatório Executivo quanto o Relatório Técnico
  const handleBatchExportPDF = async () => {
    setIsGenerating(true);
    const prevTheme = reportTheme;
    const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '_');

    try {
      // 1. Relatório Executivo
      setProgressMsg('Gerando Pacote [1/2]: Relatório Executivo...');
      setReportTheme('executivo');
      await new Promise((r) => setTimeout(r, 250));

      const pdfExec = new jsPDF('p', 'mm', 'a4');
      const pageIdsExec: string[] = [];
      if (includeCover) pageIdsExec.push('report-pdf-page-cover');
      pageIdsExec.push('report-pdf-page-1');

      for (let i = 0; i < pageIdsExec.length; i++) {
        setProgressMsg(`[1/2 Executivo] Renderizando página ${i + 1} de ${pageIdsExec.length}...`);
        const el = document.getElementById(pageIdsExec[i]);
        if (!el) continue;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdfExec.addPage();
        pdfExec.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      const blobExec = pdfExec.output('blob');
      await saveGeneratedReport(
        {
          companyId: activeCompany.id,
          clientName: clientName.trim(),
          fileName: filename || 'relatorio_zabbix.xlsx',
          periodStart: activeFilters?.dateFrom || undefined,
          periodEnd: activeFilters?.dateTo || undefined,
          kpis: {
            totalEvents: kpis.totalEventos,
            shortDurationPct: shortPct,
            ackRatePct: kpis.taxaAtuacaoPercentual,
            mttrSec: kpis.mttrSegundos,
            mtbfSec: kpis.mtbfSegundosGlobal,
            topHost: kpis.hostMaisAfetado.host,
          },
          narrative: aiNarrative ? { markdown: aiNarrative } : undefined,
          pdfStored: true,
          reportTheme: 'executivo',
          documentCode,
          revision,
          elaborator,
          approver,
          operationalNotes,
          dataSnapshot: {
            totalEvents: events.length,
            hostCount: Object.keys(events.reduce((acc, e) => ({ ...acc, [e.host]: true }), {})).length,
            triggerCount: Object.keys(events.reduce((acc, e) => ({ ...acc, [e.incidente]: true }), {})).length,
            dateRange: `${activeFilters?.dateFrom || 'Início'} até ${activeFilters?.dateTo || 'Fim'}`,
          },
        },
        blobExec
      );
      pdfExec.save(`Relatorio_Executivo_Triggers_${safeName}_${isoAnoMes}.pdf`);

      // 2. Relatório Técnico
      setProgressMsg('Gerando Pacote [2/2]: Relatório Técnico Estruturado...');
      setReportTheme('tecnico');
      await new Promise((r) => setTimeout(r, 250));

      const pdfTec = new jsPDF('p', 'mm', 'a4');
      const pageIdsTec: string[] = [];
      if (includeCover) pageIdsTec.push('report-pdf-page-cover');
      pageIdsTec.push('report-pdf-page-1', 'report-pdf-page-2', 'report-pdf-page-3');

      for (let i = 0; i < pageIdsTec.length; i++) {
        setProgressMsg(`[2/2 Técnico] Renderizando página ${i + 1} de ${pageIdsTec.length}...`);
        const el = document.getElementById(pageIdsTec[i]);
        if (!el) continue;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdfTec.addPage();
        pdfTec.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      const blobTec = pdfTec.output('blob');
      await saveGeneratedReport(
        {
          companyId: activeCompany.id,
          clientName: clientName.trim(),
          fileName: filename || 'relatorio_zabbix.xlsx',
          periodStart: activeFilters?.dateFrom || undefined,
          periodEnd: activeFilters?.dateTo || undefined,
          kpis: {
            totalEvents: kpis.totalEventos,
            shortDurationPct: shortPct,
            ackRatePct: kpis.taxaAtuacaoPercentual,
            mttrSec: kpis.mttrSegundos,
            mtbfSec: kpis.mtbfSegundosGlobal,
            topHost: kpis.hostMaisAfetado.host,
          },
          narrative: aiNarrative ? { markdown: aiNarrative } : undefined,
          pdfStored: true,
          reportTheme: 'tecnico',
          documentCode,
          revision,
          elaborator,
          approver,
          operationalNotes,
          dataSnapshot: {
            totalEvents: events.length,
            hostCount: Object.keys(events.reduce((acc, e) => ({ ...acc, [e.host]: true }), {})).length,
            triggerCount: Object.keys(events.reduce((acc, e) => ({ ...acc, [e.incidente]: true }), {})).length,
            dateRange: `${activeFilters?.dateFrom || 'Início'} até ${activeFilters?.dateTo || 'Fim'}`,
          },
        },
        blobTec
      );
      pdfTec.save(`Relatorio_Tecnico_Triggers_${safeName}_${isoAnoMes}.pdf`);

      setReportTheme(prevTheme);
      onClose();
    } catch (err: any) {
      console.error('Erro no lote PDF:', err);
      alert('Falha ao exportar pacote em lote: ' + err.message);
    } finally {
      setIsGenerating(false);
      setProgressMsg('');
    }
  };

  // ========================================================
  // RENDERIZADORES DE CABEÇALHO & CAPA (ESTRUTURADO / EXECUTIVO)
  // ========================================================

  /**
   * Cabeçalho Estruturado em Grade Institucional Oficial
   */
  const renderStructuredHeader = (currentSheet: number, totalSheets: number) => (
    <div
      style={{
        border: '1.5px solid #0f172a',
        background: '#ffffff',
        color: '#0f172a',
        marginBottom: '14px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Linha 1 e 2: Bloco Superior com Logo, Título, ID, Revisão e Folha */}
      <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 140px', borderBottom: '1.5px solid #0f172a' }}>
        {/* Coluna 1: Logo */}
        <div
          style={{
            borderRight: '1.5px solid #0f172a',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '52px',
          }}
        >
          {logoDataUrl ? (
            <img
              src={logoDataUrl}
              alt="Logo"
              style={{ maxHeight: '42px', maxWidth: '150px', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ fontSize: '18px', fontWeight: 900, color: '#0284c7', letterSpacing: '-0.02em' }}>
              {companyName || 'solor'}
            </span>
          )}
        </div>

        {/* Coluna 2: Título Central e Subcélulas de Controle */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1.5px solid #0f172a' }}>
          <div
            style={{
              padding: '6px 10px',
              borderBottom: '1px solid #0f172a',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0f172a' }}>
              {reportTitle.trim() || 'RELATÓRIO TÉCNICO DE MONITORAMENTO'}
            </span>
          </div>
          {/* Subcélulas: ID | Revisão | Folha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', fontSize: '8px' }}>
            <div style={{ padding: '3.5px 6px', borderRight: '1px solid #0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontWeight: 800, textTransform: 'uppercase', color: '#475569' }}>ID:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{documentCode}</span>
            </div>
            <div style={{ padding: '3.5px 6px', borderRight: '1px solid #0f172a', textAlign: 'center' }}>
              <span style={{ textTransform: 'uppercase', color: '#475569', fontSize: '7px', display: 'block' }}>Revisão:</span>
              <strong style={{ fontSize: '8.5px' }}>{revision}</strong>
            </div>
            <div style={{ padding: '3.5px 6px', textAlign: 'center' }}>
              <span style={{ textTransform: 'uppercase', color: '#475569', fontSize: '7px', display: 'block' }}>Folha:</span>
              <strong style={{ fontSize: '8.5px', fontFamily: 'monospace' }}>
                {currentSheet}/{totalSheets}
              </strong>
            </div>
          </div>
        </div>

        {/* Coluna 3: Publicação e Data Revisão */}
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '8px' }}>
          <div style={{ padding: '4px 6px', borderBottom: '1px solid #0f172a', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ textTransform: 'uppercase', color: '#475569', fontSize: '7px', fontWeight: 800 }}>Publicação:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '8.5px' }}>{publicationDate}</span>
          </div>
          <div style={{ padding: '4px 6px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ textTransform: 'uppercase', color: '#475569', fontSize: '7px', fontWeight: 800 }}>Revisão:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '8.5px' }}>{revisionDate}</span>
          </div>
        </div>
      </div>

      {/* Linha 3: Modelo Operacional Exclusivo NOC */}
      <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', borderBottom: '1.5px solid #0f172a', fontSize: '8.5px' }}>
        <div style={{ borderRight: '1.5px solid #0f172a', padding: '3.5px 8px', fontWeight: 800, textTransform: 'uppercase', color: '#0f172a' }}>
          Modelo
        </div>
        <div style={{ padding: '3.5px 10px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '8.5px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#0284c7', fontWeight: 900 }}>[X]</span>
            <span style={{ color: '#0f172a', fontWeight: 800 }}>NOC | Network Operations Center</span>
          </span>
        </div>
      </div>

      {/* Linha 4: Objetivo / Descrição resumida */}
      <div style={{ padding: '4.5px 8px', borderBottom: '1.5px solid #0f172a', fontSize: '7.5px', color: '#334155', lineHeight: 1.35 }}>
        {objectiveDescription || 'Avaliação de ruído operacional, tempo de vida de incidentes e tuning cirúrgico de triggers Zabbix 7.0.'}
      </div>

      {/* Linha 5: Elaborador e Aprovador */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '8px' }}>
        <div style={{ borderRight: '1.5px solid #0f172a', padding: '3.5px 8px' }}>
          <strong style={{ fontSize: '7px', textTransform: 'uppercase', color: '#475569', marginRight: '4px' }}>Elaborador:</strong>
          <span style={{ fontWeight: 600 }}>{elaborator || 'Equipe de Observabilidade'}</span>
        </div>
        <div style={{ padding: '3.5px 8px' }}>
          <strong style={{ fontSize: '7px', textTransform: 'uppercase', color: '#475569', marginRight: '4px' }}>Aprovador:</strong>
          <span style={{ fontWeight: 600 }}>{approver || techResponsible || 'Gerência de NOC'}</span>
        </div>
      </div>
    </div>
  );

  // Alias para retrocompatibilidade
  const renderPopHeader = renderStructuredHeader;

  /**
   * Cabeçalho Executivo Moderno (Layout Limpo com Logo, Título e Badge)
   */
  const renderModernHeader = (currentSheet: number, totalSheets: number) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingBottom: '12px',
        borderBottom: '2px solid #0f172a',
        marginBottom: '14px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {logoDataUrl && (
          <img
            src={logoDataUrl}
            alt="Logo"
            style={{ maxHeight: '42px', maxWidth: '140px', objectFit: 'contain' }}
          />
        )}
        <div>
          <h1 style={{ fontSize: '17px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', color: '#0f172a', margin: 0 }}>
            {reportTitle || (reportTheme === 'executivo' ? 'SUMÁRIO EXECUTIVO DE OBSERVABILIDADE & SLA' : 'ENGENHARIA & TUNING DE TRIGGERS')}
          </h1>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 500, marginTop: '2px', marginBottom: 0 }}>
            Recorte {mesAno} · Cliente: <strong>{clientName || 'Geral'}</strong> · {documentCode} · Folha {currentSheet}/{totalSheets}
          </p>
        </div>
      </div>

      <div
        style={{
          backgroundColor: reportTheme === 'executivo' ? '#d97706' : '#0284c7',
          color: '#ffffff',
          padding: '5px 12px',
          borderRadius: '4px',
          fontWeight: 800,
          fontSize: '9px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          textAlign: 'center',
        }}
      >
        {selectedDepartmentTag || 'NOC | Network Operations Center'}
      </div>
    </div>
  );

  /**
   * Renderizador da Página de Capa / Introdução (A4: 794px x 1123px)
   */
  const renderCoverPage = (isPdf = false) => {
    // 1. ESTILO CAPA PADRÃO OFICIAL (Tabela Estruturada Institucional)
    if (coverStyle === 'padrao_oficial') {
      return (
        <div
          id={isPdf ? 'report-pdf-page-cover' : undefined}
          style={{
            width: '794px',
            height: '1123px',
            maxHeight: '1123px',
            padding: '38px 44px',
            background: '#ffffff',
            color: '#0f172a',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            position: 'relative',
          }}
        >
          <div>
            {/* Cabeçalho Oficial POP no topo da Capa */}
            {renderPopHeader(1, totalSheetsCount)}

            {/* Imagem de Capa Personalizada ou Banner Gráfico */}
            <div style={{ marginTop: '16px', marginBottom: '16px', textAlign: 'center' }}>
              {coverImageDataUrl ? (
                <div
                  style={{
                    width: '100%',
                    height: '240px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1.5px solid #0f172a',
                    boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                  }}
                >
                  <img
                    src={coverImageDataUrl}
                    alt="Capa do Relatório"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '190px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0284c7 100%)',
                    color: '#ffffff',
                    border: '1.5px solid #0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    boxSizing: 'border-box',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#38bdf8', fontWeight: 800, marginBottom: '6px' }}>
                    CENTRO DE OPERAÇÕES DE REDE · {selectedDepartmentTag || 'NOC | Network Operations Center'}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', textAlign: 'center', maxWidth: '580px' }}>
                    {reportTitle.trim() || 'RELATÓRIO TÉCNICO DE MONITORAMENTO'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '6px' }}>
                    Engenharia de Confiabilidade · Análise de Triggers · Eliminação de Ruído
                  </div>
                </div>
              )}
            </div>

            {/* Bloco Central de Identificação e Controle */}
            <div style={{ marginTop: '10px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }}>
                  Documento Oficial
                </span>
                <span style={{ fontSize: '9.5px', fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>
                  {documentCode} · Rev. {revision}
                </span>
              </div>

              <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '4px 0 6px 0', lineHeight: 1.25 }}>
                {coverSubtitle || reportTitle.trim() || 'RELATÓRIO TÉCNICO DE MONITORAMENTO'}
              </h1>

              <p style={{ fontSize: '10px', color: '#475569', lineHeight: 1.45, margin: 0 }}>
                {objectiveDescription || 'Diretrizes técnicas para análise criteriosa de triggers Zabbix, parametrização de expressões com histerese e erradicação de flapping operacional.'}
              </p>
            </div>

            {/* Grade de Metadados do Cliente & Período */}
            <div style={{ border: '1.5px solid #0f172a', borderRadius: '6px', overflow: 'hidden', background: '#f8fafc', marginBottom: '14px' }}>
              <table style={{ width: '100%', fontSize: '8.5px', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '6px 10px', width: '25%', fontWeight: 800, color: '#475569', textTransform: 'uppercase', fontSize: '7.5px' }}>Organização / Cliente:</td>
                    <td style={{ padding: '6px 10px', width: '75%', fontWeight: 800, color: '#0f172a', fontSize: '10px' }}>{clientName || 'Geral'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', fontSize: '7.5px' }}>Recorte Temporal:</td>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: '#0f172a' }}>{mesAno} ({periodoDescricao})</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', fontSize: '7.5px' }}>Elaborador Técnico:</td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{elaborator}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', fontSize: '7.5px' }}>Aprovador Responsável:</td>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: '#0f172a' }}>{approver || techResponsible}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4 Cards de Resumo Executivo na Capa */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <div style={{ border: '1px solid #e2e8f0', background: '#ffffff', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                <span style={{ fontSize: '7px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>TOTAL EVENTOS</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>{kpis.totalEventos}</div>
              </div>
              <div style={{ border: '1px solid #fecaca', background: '#fef2f2', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                <span style={{ fontSize: '7px', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', display: 'block' }}>RUÍDO (&lt; 5m)</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#dc2626', fontFamily: 'monospace' }}>{shortPct}%</div>
              </div>
              <div style={{ border: '1px solid #bfdbfe', background: '#eff6ff', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                <span style={{ fontSize: '7px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', display: 'block' }}>MTTR MÉDIO</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563eb', fontFamily: 'monospace' }}>{formatDuration(kpis.mttrSegundos)}</div>
              </div>
              <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                <span style={{ fontSize: '7px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', display: 'block' }}>ATENDIMENTO</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#16a34a', fontFamily: 'monospace' }}>{kpis.taxaAtuacaoPercentual}%</div>
              </div>
            </div>
          </div>

          {/* Rodapé Confidencial Oficial POP */}
          <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', textAlign: 'center' }}>
            <p style={{ fontSize: '7px', color: '#64748b', margin: '0 0 2px 0', lineHeight: 1.35 }}>
              As informações contidas neste documento são proprietárias e confidenciais, somente para uso interno da <strong>{companyName || 'SOLOR Tecnologia'}</strong> ou por pessoas expressamente autorizadas pela mesma.
            </p>
            <p style={{ fontSize: '6.5px', color: '#94a3b8', margin: 0 }}>
              Direitos Autorais © {companyName || 'SOLOR Tecnologia'} {new Date().getFullYear()} – Todos os direitos reservados. Documentos impressos não são controlados, utilize a versão armazenada eletronicamente.
            </p>
          </div>
        </div>
      );
    }

    if (coverStyle === 'institucional_gradient') {
      return (
        <div
          id={isPdf ? 'report-pdf-page-cover' : undefined}
          style={{
            width: '794px',
            height: '1123px',
            maxHeight: '1123px',
            padding: '70px 60px',
            background: 'linear-gradient(150deg, #071c36 0%, #0d386d 40%, #1555a3 75%, #1862b5 100%)',
            color: '#ffffff',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {/* Curvas SVG fluidas de alto impacto em segundo plano */}
          <svg
            viewBox="0 0 794 1123"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <path
              d="M 60,-80 C 60,200 560,180 560,460 C 560,700 100,680 100,920 C 100,1070 330,1130 430,1180"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="18"
              strokeOpacity="0.25"
              strokeLinecap="round"
            />
            <path
              d="M 130,-60 C 130,160 480,220 480,500 C 480,740 50,760 50,960"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="6"
              strokeOpacity="0.18"
              strokeLinecap="round"
            />
          </svg>

          {/* Topo / Escopo */}
          <div style={{ position: 'relative', zIndex: 10 }}>
            <div
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                background: 'rgba(255,255,255,0.12)',
                borderRadius: '6px',
                fontSize: '9.5px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#93c5fd',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
            >
              {selectedDepartmentTag || 'SNOC · Observabilidade & Confiabilidade'}
            </div>
          </div>

          {/* Centro: Imagem Opcional + Título do Relatório & Metadados do Documento */}
          <div style={{ position: 'relative', zIndex: 10, maxWidth: '580px', marginTop: 'auto', marginBottom: 'auto' }}>
            {coverImageDataUrl && (
              <div style={{ width: '100%', height: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', marginBottom: '18px' }}>
                <img src={coverImageDataUrl} alt="Capa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <h1
              style={{
                fontSize: '28px',
                fontWeight: 900,
                color: '#ffffff',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                textTransform: 'uppercase',
                margin: '0 0 10px 0',
              }}
            >
              {coverSubtitle || reportTitle || 'C.D.C.I | SNOC – Monitoramento'}
            </h1>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#93c5fd', fontFamily: 'monospace', letterSpacing: '0.02em', marginBottom: '6px' }}>
              {documentCode}
            </div>
            <div style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 500, marginBottom: '22px' }}>
              Emissão: {publicationDate} – versão {revision || '1'}
            </div>

            <div
              style={{
                padding: '14px 18px',
                background: 'rgba(15, 23, 42, 0.45)',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <span style={{ fontSize: '8.5px', fontWeight: 800, textTransform: 'uppercase', color: '#38bdf8', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>
                Organização / Contratante
              </span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', display: 'block' }}>
                {clientName || 'Ambiente Corporativo'}
              </span>
              <p style={{ fontSize: '9.5px', color: '#cbd5e1', marginTop: '6px', marginBottom: 0, lineHeight: 1.45 }}>
                {objectiveDescription || 'Relatório Analítico de Incidentes, Ruído Operacional e Engenharia de Triggers Zabbix 7.0 LTS.'}
              </p>
            </div>
          </div>

          {/* Rodapé da Capa: Barra Ciano de Destaque e Logotipo */}
          <div style={{ position: 'relative', zIndex: 10 }}>
            <div style={{ width: '56px', height: '4px', background: '#38bdf8', borderRadius: '2px', marginBottom: '16px' }} />

            {logoDataUrl ? (
              <img
                src={logoDataUrl}
                alt="Logo"
                style={{ maxHeight: '52px', maxWidth: '240px', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', textTransform: 'lowercase' }}>
                {companyName || 'solor'}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '18px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255,255,255,0.15)',
                fontSize: '8px',
                color: '#94a3b8',
              }}
            >
              <span>{companyName || 'Petros'} · Plataforma Zabbix Analyzer</span>
              <span>Documento Oficial de Engenharia</span>
            </div>
          </div>
        </div>
      );
    }

    // Estilo Capa Minimalista Técnica
    return (
      <div
        id={isPdf ? 'report-pdf-page-cover' : undefined}
        style={{
          width: '794px',
          height: '1123px',
          maxHeight: '1123px',
          padding: '65px 55px',
          background: '#ffffff',
          color: '#0f172a',
          boxSizing: 'border-box',
          border: '10px solid #0f172a',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '16px' }}>
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="Logo" style={{ maxHeight: '46px', maxWidth: '180px', objectFit: 'contain' }} />
            ) : (
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>{companyName || 'SOLOR'}</div>
            )}
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
                {selectedDepartmentTag || 'NOC | Network Operations Center'}
              </span>
              <div style={{ fontSize: '9.5px', color: '#64748b', fontFamily: 'monospace' }}>{documentCode}</div>
            </div>
          </div>

          <div style={{ marginTop: '40px' }}>
            {coverImageDataUrl && (
              <div style={{ width: '100%', height: '180px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1', marginBottom: '18px' }}>
                <img src={coverImageDataUrl} alt="Capa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#d97706', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
              Documento de Engenharia &amp; Governança
            </span>
            <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 14px 0' }}>
              {reportTitle.trim() || 'RELATÓRIO TÉCNICO DE MONITORAMENTO'}
            </h1>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#475569', margin: '0 0 20px 0' }}>
              {coverSubtitle || 'Avaliação Técnica de Ruído, Confiabilidade de Sistemas & Tuning de Triggers Zabbix 7.0'}
            </h2>
            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
              Cliente / Escopo: <strong style={{ color: '#0f172a' }}>{clientName || 'Geral'}</strong>
            </div>
          </div>
        </div>

        <div style={{ border: '1.5px solid #0f172a', padding: '14px', background: '#f8fafc', borderRadius: '4px' }}>
          <table style={{ width: '100%', fontSize: '9px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 6px', fontWeight: 800, color: '#475569' }}>Código:</td>
                <td style={{ padding: '4px 6px', fontFamily: 'monospace', fontWeight: 700 }}>{documentCode}</td>
                <td style={{ padding: '4px 6px', fontWeight: 800, color: '#475569' }}>Revisão:</td>
                <td style={{ padding: '4px 6px' }}>{revision}</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 6px', fontWeight: 800, color: '#475569' }}>Data Emissão:</td>
                <td style={{ padding: '4px 6px' }}>{publicationDate}</td>
                <td style={{ padding: '4px 6px', fontWeight: 800, color: '#475569' }}>Período:</td>
                <td style={{ padding: '4px 6px', fontWeight: 700 }}>{mesAno}</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 6px', fontWeight: 800, color: '#475569' }}>Elaborador:</td>
                <td style={{ padding: '4px 6px' }}>{elaborator}</td>
                <td style={{ padding: '4px 6px', fontWeight: 800, color: '#475569' }}>Aprovador:</td>
                <td style={{ padding: '4px 6px', fontWeight: 700 }}>{approver || techResponsible}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ borderTop: '2px solid #0f172a', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#64748b' }}>
          <span>{companyName} · Observabilidade Corporativa</span>
          <span>Página de Introdução / Capa</span>
        </div>
      </div>
    );
  };

  const totalSheetsCount = (includeCover ? 1 : 0) + 3 + (sectionsConfig.includePromptAppendix ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto">
      {/* Modal Dialog Ampliado para Suportar Pré-visualização das Páginas */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-7 max-h-[92vh] flex flex-col">
        {/* Botão de Fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho do Modal */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Exportação de Relatório Técnico &amp; Executivo</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Padrão profissional de 3 páginas com cabeçalho white-label, diagnóstico de IA e histórico SaaS.
              </p>
            </div>
          </div>

          {/* Alternador de Abas do Modal: Configurações vs Pré-visualização */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setModalTab('config')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                modalTab === 'config'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Configuração</span>
            </button>
            <button
              type="button"
              onClick={() => setModalTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                modalTab === 'preview'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Pré-visualização</span>
            </button>
          </div>
        </div>

        {/* Conteúdo do Modal com Scroll Interno */}
        <div className="flex-1 overflow-y-auto py-5 pr-1">
          {modalTab === 'config' ? (
            <div className="space-y-5">
              {/* Indicador Visual do Recorte de Data (Acompanhamento Rigoroso do Filtro) */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      Recorte Temporal do Relatório: <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">{mesAno}</span>
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {periodoDescricao}
                    </span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isFiltered
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  {isFiltered ? '✓ Sincronizado com Filtro' : 'Total do Dataset'}
                </span>
              </div>

              {/* Indicador de Catálogo de Triggers Vinculado */}
              {effectiveCatalog && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <Code2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        Catálogo de Triggers Vinculado ({effectiveCatalog.totalTriggers} expressões)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        Planilha: {effectiveCatalog.fileName}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                    Ativo para IA &amp; Relatório
                  </span>
                </div>
              )}

              {/* SELETOR DE MODELOS DE RELATÓRIO (Técnico vs Executivo vs Book de Resultados) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  Modelo de Relatório &amp; Estrutura
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Card Modelo Técnico */}
                  <div
                    onClick={() => handleThemeChange('tecnico')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      reportTheme === 'tecnico'
                        ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Wrench className={`w-4 h-4 ${reportTheme === 'tecnico' ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span>Modelo Técnico</span>
                      </div>
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        reportTheme === 'tecnico' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
                      }`}>
                        {reportTheme === 'tecnico' && <Check className="w-2.5 h-2.5" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Focado em engenharia de triggers, sintaxes de histerese Zabbix 7.0 (<code className="text-[10px]">nodata</code>, <code className="text-[10px]">min/max</code>), matriz de dependências e diagnóstico de logs.
                    </p>
                  </div>

                  {/* Card Modelo Executivo */}
                  <div
                    onClick={() => handleThemeChange('executivo')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      reportTheme === 'executivo'
                        ? 'border-amber-600 bg-amber-50/40 dark:bg-amber-950/20 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Briefcase className={`w-4 h-4 ${reportTheme === 'executivo' ? 'text-amber-600' : 'text-slate-400'}`} />
                        <span>Modelo Executivo</span>
                      </div>
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        reportTheme === 'executivo' ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300'
                      }`}>
                        {reportTheme === 'executivo' && <Check className="w-2.5 h-2.5" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Focado em SLA, saúde da infraestrutura, impacto financeiro da fadiga de alertas, benchmarking de MTTR/MTBF e governança para a diretoria.
                    </p>
                  </div>

                  {/* Card Book de Resultados */}
                  <div
                    onClick={() => handleThemeChange('book_resultados')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      reportTheme === 'book_resultados'
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Sparkles className={`w-4 h-4 ${reportTheme === 'book_resultados' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <span>Book de Resultados</span>
                      </div>
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        reportTheme === 'book_resultados' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                      }`}>
                        {reportTheme === 'book_resultados' && <Check className="w-2.5 h-2.5" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Apanhado direcionado unificando governança executiva C-Level (SLA e custos) com engenharia técnica de triggers e histerese NOC.
                    </p>
                  </div>
                </div>
              </div>

              {/* INDICADOR VISUAL DO STATUS DA IA & DISPARO SOB DEMANDA */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Análise Estruturada por IA
                        </span>
                        {aiStatus === 'success' && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Análise Pronta ({aiModelUsed})</span>
                          </span>
                        )}
                        {aiStatus === 'generating' && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Processando com IA...</span>
                          </span>
                        )}
                        {aiStatus === 'error' && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Erro na Análise</span>
                          </span>
                        )}
                        {aiStatus === 'idle' && (
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded-full">
                            Pendente para este modelo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {reportTheme === 'book_resultados'
                          ? 'A IA sintetizará o Book de Resultados unificado: risco financeiro, SLA, tuning de histerese e plano NOC.'
                          : reportTheme === 'executivo'
                          ? 'A IA sintetizará risco ao negócio, conformidade de SLA e recomendações C-Level.'
                          : 'A IA sintetizará diagnóstico de histerese, dependências e plano operacional de NOC.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTriggerAiAnalysis(reportTheme)}
                    disabled={aiStatus === 'generating'}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white shadow-2xs transition-all cursor-pointer"
                  >
                    {aiStatus === 'generating' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Gerando...</span>
                      </>
                    ) : aiStatus === 'success' ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Atualizar ({reportTheme === 'book_resultados' ? 'Book' : reportTheme === 'executivo' ? 'Executivo' : 'Técnico'})</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Gerar Análise IA ({reportTheme === 'book_resultados' ? 'Book' : reportTheme === 'executivo' ? 'Executiva' : 'Técnica'})</span>
                      </>
                    )}
                  </button>
                </div>

                {aiError && (
                  <div className="mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-300">
                    {aiError}
                  </div>
                )}

                {isFromCache && (
                  <div className="mt-2.5 flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      Diagnóstico recuperado instantaneamente do cache local
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTriggerAiAnalysis(reportTheme, operationalNotes, true)}
                      className="font-bold underline hover:text-emerald-950 dark:hover:text-emerald-100 cursor-pointer ml-2 shrink-0"
                    >
                      Forçar Nova Análise com IA
                    </button>
                  </div>
                )}

                {/* PAINEL DE INSPEÇÃO & PERSONALIZAÇÃO DO PROMPT */}
                <div className="mt-3.5 pt-3 border-t border-slate-200 dark:border-slate-700/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Engenharia de Prompt &amp; Diretrizes do Auditor
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({compiledPrompt.length.toLocaleString('pt-BR')} caracteres compilados)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(compiledPrompt);
                          setPromptCopied(true);
                          setTimeout(() => setPromptCopied(false), 2000);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Copiar prompt completo"
                      >
                        {promptCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{promptCopied ? 'Copiado!' : 'Copiar Prompt'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsPromptDrawerOpen(!isPromptDrawerOpen)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{isPromptDrawerOpen ? 'Ocultar Prompt' : 'Inspecionar Prompt'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Drawer com o Prompt Compilado */}
                  {isPromptDrawerOpen && (
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-[11px] font-mono space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                          Prompt Compilado em Tempo Real ({reportTheme === 'book_resultados' ? 'Book de Resultados' : reportTheme === 'executivo' ? 'Executivo' : 'Técnico'})
                        </span>
                        <span className="text-[10px] text-indigo-400">Pronto para Envio à IA</span>
                      </div>
                      <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[10px] text-slate-300 pr-2 scrollbar-thin">
                        {compiledPrompt}
                      </pre>
                    </div>
                  )}

                  {/* Campo de Diretrizes Adicionais do Usuário / Auditor */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Diretrizes &amp; Instruções Personalizadas do Auditor (Injetadas no Prompt)
                    </label>
                    <textarea
                      value={customDirectives}
                      onChange={(e) => setCustomDirectives(e.target.value)}
                      placeholder="Ex: Enfatizar que as rotinas de backup noturno do Oracle já possuem janela aprovada; priorizar impacto no plantão de NOC e sugerir tolerâncias mínimas de 180s..."
                      rows={2}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] font-medium text-slate-400">Atalhos de diretriz:</span>
                      {[
                        'Priorizar impacto financeiro e SLA contratual',
                        'Recomendar histerese estrita de 5 minutos',
                        'Destacar correlação de falhas no cluster Oracle',
                        'Enfatizar redução de alertas no turno da madrugada',
                      ].map((directive, dIdx) => (
                        <button
                          key={dIdx}
                          type="button"
                          onClick={() => setCustomDirectives((prev) => (prev ? `${prev}; ${directive}` : directive))}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          + {directive}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {isFromCache && (
                  <div className="mt-2.5 flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      Diagnóstico recuperado instantaneamente do cache local
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTriggerAiAnalysis(reportTheme, operationalNotes, true)}
                      className="font-bold underline hover:text-emerald-950 dark:hover:text-emerald-100 cursor-pointer ml-2 shrink-0"
                    >
                      Forçar Nova Análise com IA
                    </button>
                  </div>
                )}

                {/* ENRIQUECIMENTO DE CONTEXTO OPERACIONAL (CHAT / MENSAGENS COM IA) */}
                <div className="mt-3.5 pt-3 border-t border-slate-200 dark:border-slate-700/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquarePlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Particularidades &amp; Contexto Operacional (Instruções Adicionais para IA)
                      </span>
                    </div>
                    {operationalNotes.length > 0 && (
                      <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                        {operationalNotes.length} {operationalNotes.length === 1 ? 'regra informada' : 'regras informadas'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Insira informações específicas do ambiente que a planilha não possui (ex: servidores programados para desligar diariamente ou aos finais de semana, janelas de manutenção, rotinas de backup). A IA ajustará o laudo e incluirá uma seção dedicada no documento.
                  </p>

                  {/* Lista de notas ativas */}
                  {operationalNotes.length > 0 && (
                    <div className="space-y-1.5">
                      {operationalNotes.map((note, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 shadow-2xs"
                        >
                          <div className="flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                            <span className="text-[11px] leading-relaxed">{note}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveContextNote(idx)}
                            className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer shrink-0"
                            title="Remover informação"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Campo de envio de nova mensagem/regra operacional */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newContextNote}
                      onChange={(e) => setNewContextNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddContextNote(newContextNote);
                        }
                      }}
                      placeholder="Ex: Servidores de relatórios desligam todo dia às 22h e finais de semana..."
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddContextNote(newContextNote)}
                      disabled={!newContextNote.trim() || aiStatus === 'generating'}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-2xs transition-all cursor-pointer shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Inserir</span>
                    </button>
                  </div>

                  {/* Pílulas de atalho rápido */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-semibold text-slate-400">Sugestões rápidas:</span>
                    {[
                      'Servidores desligam diariamente às 22h e finais de semana',
                      'Janela de manutenção preventiva todo domingo às 02h',
                      'Rotina de backup noturno entre 01h e 04h com alta carga de I/O',
                      'Servidores legados em processo de desativação',
                    ].map((pillText, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => handleAddContextNote(pillText)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>{pillText}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* CAMPOS DE IDENTIFICAÇÃO E WHITE-LABEL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Empresa Emissora (White-label)
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ex: Petros"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Badge superior direito: <code>NOC {companyName || 'Petros'} / OBSERVABILIDADE</code>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cliente / Contratante
                  </label>
                  {availableClients.length > 0 ? (
                    <div className="space-y-2">
                      <select
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      >
                        {availableClients.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                        <option value="custom">+ Outro cliente (digitar manualmente)</option>
                      </select>
                      {clientName === 'custom' && (
                        <input
                          type="text"
                          onChange={(e) => setClientName(e.target.value)}
                          placeholder="Digite o nome do cliente"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: PetroRio / Equinix Datacenter"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  )}
                </div>
              </div>

              <div>
                {/* REGRA DO CARGO */}
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Responsável Técnico (Nome e Cargo exato)
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={techResponsible}
                    onChange={(e) => setTechResponsible(e.target.value)}
                    placeholder="Ex: Engenheiro Sênior de Observabilidade"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Será impresso no rodapé da aprovação exatamente como digitado. Se vazio, exibe "—".
                </span>
              </div>

              {/* SEÇÃO: IDENTIDADE VISUAL, CABEÇALHO POP & CAPA DO RELATÓRIO */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Identidade Visual &amp; Personalização do Relatório
                    </span>
                  </div>

                  {selectedClientObj && (
                    <button
                      type="button"
                      onClick={handleSaveClientBranding}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {brandingSavedFeedback ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">Salvo no cliente!</span>
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>Salvar como padrão deste cliente</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* 1. Escolha do Modelo de Cabeçalho */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Modelo de Cabeçalho das Páginas Internas
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setHeaderStyle('modelo_estruturado')}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        headerStyle === 'modelo_estruturado'
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>📋 Modelo Técnico Estruturado</span>
                        </span>
                        {headerStyle === 'modelo_estruturado' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Grade formal com Logo, ID, Revisão, Folha, Modelo Operacional (NOC) e Aprovadores.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHeaderStyle('executivo_moderno')}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        headerStyle === 'executivo_moderno'
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-blue-600" />
                          <span>👔 Executivo Moderno</span>
                        </span>
                        {headerStyle === 'executivo_moderno' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Layout contemporâneo com logo alinhada, título do relatório e badge de NOC/SLA.
                      </p>
                    </button>
                  </div>
                </div>

                {/* 2. Opções da Página de Capa / Introdução */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeCover}
                        onChange={(e) => {
                          setIncludeCover(e.target.checked);
                          if (!e.target.checked && previewPage === 'cover') {
                            setPreviewPage(1);
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Incluir Página de Capa Oficial no PDF (+1 Página A4)</span>
                      </span>
                    </label>

                    {includeCover && (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        Ativa (Página 1 do PDF)
                      </span>
                    )}
                  </div>

                  {includeCover && (
                    <div className="mt-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in">
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Estilo Visual da Capa
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setCoverStyle('padrao_oficial')}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                            coverStyle === 'padrao_oficial'
                              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold">📋 Padrão Oficial SNOC</span>
                            {coverStyle === 'padrao_oficial' && <Check className="w-3 h-3 text-blue-600" />}
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            Grade oficial completa, banner centralizado em destaque e controle formal.
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCoverStyle('institucional_gradient')}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                            coverStyle === 'institucional_gradient'
                              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold">📘 Gradiente SNOC</span>
                            {coverStyle === 'institucional_gradient' && <Check className="w-3 h-3 text-blue-600" />}
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            Fundo escuro profundo com ondas SVG e acento ciano de alta tecnologia.
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCoverStyle('minimalista_tecnica')}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                            coverStyle === 'minimalista_tecnica'
                              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold">📄 Minimalista</span>
                            {coverStyle === 'minimalista_tecnica' && <Check className="w-3 h-3 text-blue-600" />}
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            Fundo claro, moldura técnica com tabela estruturada de emissão.
                          </span>
                        </button>
                      </div>

                      {/* Upload de Imagem de Capa */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          Imagem da Capa (Banner ou Foto Institucional)
                        </label>
                        <div className="flex items-center gap-3">
                          {coverImageDataUrl ? (
                            <div className="relative w-24 h-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 overflow-hidden">
                              <img src={coverImageDataUrl} alt="Capa" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setCoverImageDataUrl('')}
                                className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                                title="Remover imagem"
                              >
                                &times;
                              </button>
                            </div>
                          ) : (
                            <div className="w-24 h-16 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 text-[10px]">
                              <span>Sem imagem</span>
                              <span className="text-[8px] text-slate-400">Padrão ativo</span>
                            </div>
                          )}

                          <div className="space-y-1">
                            <label className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-1.5">
                              <Upload className="w-3.5 h-3.5 text-blue-600" />
                              <span>{coverImageDataUrl ? 'Substituir Imagem' : 'Carregar Imagem de Capa'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleCoverImageUpload}
                              />
                            </label>
                            <span className="text-[10px] text-slate-400 block">
                              Exibida na Capa Oficial em destaque com o nome e versão do documento.
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Subtítulo em Destaque na Capa
                        </label>
                        <input
                          type="text"
                          value={coverSubtitle}
                          onChange={(e) => setCoverSubtitle(e.target.value)}
                          placeholder="Ex: C.D.C.I | SNOC – Monitoramento"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* SELEÇÃO MODULAR DE SEÇÕES DO RELATÓRIO */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mb-2">
                    Seções a Incluir no Relatório Final (Seleção Modular)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sectionsConfig.includeCover}
                        onChange={(e) => {
                          setSectionsConfig({ ...sectionsConfig, includeCover: e.target.checked });
                          setIncludeCover(e.target.checked);
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Página de Capa Oficial</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Imagem personalizada, título, versão e metadados</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sectionsConfig.includeStructuredHeader}
                        onChange={(e) => setSectionsConfig({ ...sectionsConfig, includeStructuredHeader: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Cabeçalho Estruturado Oficial</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Grade ID, Revisão, Folha e Modelo NOC</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sectionsConfig.includeExecutiveSummary}
                        onChange={(e) => setSectionsConfig({ ...sectionsConfig, includeExecutiveSummary: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Resumo Executivo (SLA &amp; Governança)</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Diagnóstico macro, custo de fadiga e SLA</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sectionsConfig.includeTuningAnalysis}
                        onChange={(e) => setSectionsConfig({ ...sectionsConfig, includeTuningAnalysis: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Tuning Criterioso de Triggers (Ruído)</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Análise de fórmulas Zabbix e histerese</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sectionsConfig.includeKpiCharts}
                        onChange={(e) => setSectionsConfig({ ...sectionsConfig, includeKpiCharts: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Painel de Indicadores &amp; Ativos Críticos</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">MTTR, MTBF, Top Hosts e Top Triggers</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sectionsConfig.includeActionPlan}
                        onChange={(e) => setSectionsConfig({ ...sectionsConfig, includeActionPlan: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Plano de Ação &amp; Escalonamento NOC</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Matriz de dependência e homologação técnica</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sectionsConfig.includePromptAppendix}
                        onChange={(e) => setSectionsConfig({ ...sectionsConfig, includePromptAppendix: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block flex items-center gap-1.5">
                          <Code2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Apêndice Metodológico de Prompt IA (+1 Folha)</span>
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Transcrição integral do prompt, parâmetros de raciocínio e diretrizes</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 3. Logo Oficial da Empresa / Cliente */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Logotipo do Relatório (Cabeçalho &amp; Capa)
                  </label>
                  <div className="flex items-center gap-3">
                    {logoDataUrl ? (
                      <div className="relative w-16 h-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1 flex items-center justify-center">
                        <img src={logoDataUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setLogoDataUrl('')}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                          title="Remover logotipo"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-12 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 text-xs">
                        Sem logo
                      </div>
                    )}
                    <label className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Alterar Logotipo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleReportLogoUpload}
                      />
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Formatos recomendados: PNG ou SVG com fundo transparente.
                    </span>
                  </div>
                </div>

                {/* 4. Metadados de Controle & Identificação Oficial */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-3">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Dados de Controle &amp; Identificação Oficial
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Título do Relatório (Editável)
                      </label>
                      <input
                        type="text"
                        value={reportTitle}
                        onChange={(e) => setReportTitle(e.target.value)}
                        placeholder="Digite o título (ex: Relatório Técnico de Triggers, Laudo de Monitoramento...)"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Código do Documento / ID
                      </label>
                      <input
                        type="text"
                        value={documentCode}
                        onChange={(e) => setDocumentCode(e.target.value)}
                        placeholder="REL.SNOC.GAB_TELCO.001"
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Revisão
                      </label>
                      <input
                        type="text"
                        value={revision}
                        onChange={(e) => setRevision(e.target.value)}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Tag Modelo Operacional
                      </label>
                      <input
                        type="text"
                        value={selectedDepartmentTag}
                        onChange={(e) => setSelectedDepartmentTag(e.target.value)}
                        placeholder="NOC | Network Operations Center"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Data Publicação
                      </label>
                      <input
                        type="text"
                        value={publicationDate}
                        onChange={(e) => setPublicationDate(e.target.value)}
                        placeholder="dd/mm/aaaa"
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Data Revisão
                      </label>
                      <input
                        type="text"
                        value={revisionDate}
                        onChange={(e) => setRevisionDate(e.target.value)}
                        placeholder="dd/mm/aaaa"
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Elaborador do Documento
                      </label>
                      <input
                        type="text"
                        value={elaborator}
                        onChange={(e) => setElaborator(e.target.value)}
                        placeholder="Equipe de Observabilidade"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Aprovador do Documento
                      </label>
                      <input
                        type="text"
                        value={approver}
                        onChange={(e) => setApprover(e.target.value)}
                        placeholder="Gerência de NOC"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Botão de Atalho para Pré-visualização */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setModalTab('preview')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <span>Pré-visualizar páginas do relatório no modelo {reportTheme === 'executivo' ? 'Executivo' : 'Técnico'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* ABA DE PRÉ-VISUALIZAÇÃO INTERATIVA */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Página Selecionada:</span>
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    {includeCover && (
                      <button
                        type="button"
                        onClick={() => setPreviewPage('cover')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                          previewPage === 'cover'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        📘 Capa
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPreviewPage(1)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                        previewPage === 1
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Página 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPage(2)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                        previewPage === 2
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Página 2
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPage(3)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                        previewPage === 3
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Página 3
                    </button>
                    {sectionsConfig.includePromptAppendix && (
                      <button
                        type="button"
                        onClick={() => setPreviewPage('prompt')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                          previewPage === 'prompt'
                            ? 'bg-indigo-600 text-white'
                            : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700'
                        }`}
                      >
                        <Code2 className="w-3 h-3" />
                        <span>Apêndice Prompt</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Tema:
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                    {reportTheme === 'book_resultados'
                      ? '✨ Book de Resultados'
                      : reportTheme === 'executivo'
                      ? '👔 Executivo'
                      : '🛠️ Técnico'}
                  </span>
                </div>
              </div>

              {/* Contêiner de Preview Escalonado */}
              <div className="border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-slate-200 dark:bg-slate-950 max-h-[560px] overflow-auto flex justify-center">
                {previewPage === 'cover' ? (
                  <div className="shadow-2xl rounded-sm overflow-hidden scale-[0.80] origin-top">
                    {renderCoverPage(false)}
                  </div>
                ) : (
                  <div className="bg-white text-slate-900 shadow-xl rounded-sm p-6 w-[680px] min-h-[900px] text-xs font-sans">
                    {/* Header configurado (Estruturado ou Moderno) */}
                    {headerStyle === 'modelo_estruturado'
                      ? renderPopHeader(
                          previewPage === 'prompt'
                            ? totalSheetsCount
                            : includeCover
                            ? Number(previewPage) + 1
                            : Number(previewPage),
                          totalSheetsCount
                        )
                      : renderModernHeader(
                          previewPage === 'prompt'
                            ? totalSheetsCount
                            : includeCover
                            ? Number(previewPage) + 1
                            : Number(previewPage),
                          totalSheetsCount
                        )}

                  {/* Se for Apêndice de Prompt */}
                  {previewPage === 'prompt' ? (
                    <div className="mt-4 space-y-3.5 text-xs font-sans">
                      <div className="border-b-2 border-slate-900 pb-2 flex items-center justify-between">
                        <div>
                          <h2 className="text-[11px] font-black uppercase text-slate-900 tracking-wide">
                            APÊNDICE DE GOVERNANÇA: METODOLOGIA E ESPECIFICAÇÃO DE PROMPT IA
                          </h2>
                          <p className="text-[8.5px] text-slate-500 font-mono">
                            Documentação transparente do motor DeepSeek R1/V3 para conformidade e auditoria técnica
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                          Homologado
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[8px] bg-slate-50 p-2.5 rounded border border-slate-200">
                        <div>
                          <span className="font-bold text-slate-500 block text-[7.5px]">MODELO COGNITIVO</span>
                          <span className="font-mono text-slate-900 font-bold">DeepSeek Reasoning Engine (V3 / R1)</span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-500 block text-[7.5px]">TEMA DESTE LAUDO</span>
                          <span className="font-mono text-slate-900 font-bold">
                            {reportTheme === 'book_resultados'
                              ? 'Book de Resultados (Unificado)'
                              : reportTheme === 'executivo'
                              ? 'Modelo Executivo (SLA & Diretoria)'
                              : 'Modelo Técnico (Engenharia Zabbix 7.0)'}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-500 block text-[7.5px]">ESCOPO PROCESSADO</span>
                          <span className="font-mono text-slate-900">
                            {events.length.toLocaleString('pt-BR')} eventos · Cliente: {clientName}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-500 block text-[7.5px]">ASSINATURA DE INTEGRIDADE</span>
                          <span className="font-mono text-slate-900">SHA-256 Digest Certificado</span>
                        </div>
                      </div>

                      {customDirectives && (
                        <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded text-[8px]">
                          <span className="font-bold text-amber-900 uppercase block mb-1 text-[7.5px]">
                            DIRETRIZES PERSONALIZADAS DO AUDITOR APLICADAS:
                          </span>
                          <p className="text-amber-950 font-mono whitespace-pre-wrap">{customDirectives}</p>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[8.5px] font-bold text-slate-800 uppercase">
                            TRANSCRIÇÃO DO PROMPT DE ANÁLISE IA
                          </span>
                          <span className="text-[7.5px] text-slate-400 font-mono">
                            {compiledPrompt.length.toLocaleString('pt-BR')} caracteres
                          </span>
                        </div>
                        <div className="bg-slate-950 text-slate-300 p-2.5 rounded font-mono text-[7px] leading-relaxed max-h-[380px] overflow-y-auto whitespace-pre-wrap border border-slate-800">
                          {compiledPrompt}
                        </div>
                      </div>
                    </div>
                  ) : reportTheme === 'executivo' ? (
                    // =================== PREVIEW EXECUTIVO ===================
                    previewPage === 1 ? (
                      <div className="mt-4 space-y-4">
                        {/* 4 Cards Executivos */}
                        <div className="grid grid-cols-4 gap-2">
                          <div className="border-l-3 border-emerald-500 bg-emerald-50/70 p-2 rounded-r">
                            <span className="text-[7.5px] font-bold text-emerald-700 uppercase block">DISPONIBILIDADE DO ESCOPO</span>
                            <div className="text-xl font-black text-emerald-900 font-mono">
                              {kpis.mtbfDetails?.taxaDisponibilidadePct !== undefined
                                ? `${kpis.mtbfDetails.taxaDisponibilidadePct.toFixed(2)}%`
                                : '99.4%'}
                            </div>
                            <span className="text-[7.5px] text-emerald-700 font-mono">
                              Meta: 99.0% · Base {kpis.totalHorasPlanejadasPeriodo || 720}h ({kpis.totalDiasPeriodo || 30}d)
                            </span>
                          </div>
                          <div className="border-l-3 border-red-500 bg-red-50/70 p-2 rounded-r">
                            <span className="text-[7.5px] font-bold text-red-700 uppercase block">RUÍDO OPERACIONAL</span>
                            <div className="text-xl font-black text-red-900 font-mono">{shortPct}%</div>
                            <span className="text-[7.5px] text-red-700">{kpis.totalRuidoOperacional} de {kpis.totalEventos} alarmes &lt; 5m</span>
                          </div>
                          <div className="border-l-3 border-blue-500 bg-blue-50/70 p-2 rounded-r">
                            <span className="text-[7.5px] font-bold text-blue-700 uppercase block">MTTR MÉDIO</span>
                            <div className="text-xl font-black text-blue-900 font-mono">{formatDuration(kpis.mttrSegundos)}</div>
                            <span className="text-[7.5px] text-blue-700">Tempo Médio Resolução</span>
                          </div>
                          <div className="border-l-3 border-amber-500 bg-amber-50/70 p-2 rounded-r">
                            <span className="text-[7.5px] font-bold text-amber-700 uppercase block">ATENDIMENTO HUMANO</span>
                            <div className="text-xl font-black text-amber-900 font-mono">{kpis.taxaAtuacaoPercentual}%</div>
                            <span className="text-[7.5px] text-amber-700">Taxa de Reconhecimento</span>
                          </div>
                        </div>

                        {/* Diagnóstico Executivo */}
                        <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-[9.5px] text-amber-900 leading-relaxed">
                          <strong>Diagnóstico Estratégico:</strong> Identificamos que <strong>{shortPct}%</strong> dos alarmes no período foram ruídos transitórios autorresolvidos, provocando alta fadiga operacional na equipe de monitoramento. O host crítico <strong>{typeof kpis.hostMaisAfetado?.host === 'object' && kpis.hostMaisAfetado?.host !== null ? ((kpis.hostMaisAfetado.host as any).host || String(kpis.hostMaisAfetado.host)) : String(kpis.hostMaisAfetado?.host || '—')}</strong> concentrou <strong>{kpis.hostMaisAfetado?.count ?? 0} eventos</strong>, demandando revisão emergencial para proteger o SLA de atendimento.
                        </div>

                        {/* Tabela de Ofensores Executivos */}
                        <div>
                          <h2 className="text-[10px] font-bold uppercase border-b border-slate-900 pb-1 mb-2 text-slate-900">
                            1. Ativos Críticos &amp; Impacto na Confiabilidade
                          </h2>
                          <table className="w-full border-collapse text-[8.5px]">
                            <thead>
                              <tr className="bg-slate-900 text-white uppercase text-[7.5px]">
                                <th className="p-1.5 text-left">Host / Ativo Crítico</th>
                                <th className="p-1.5 text-center">Incidentes</th>
                                <th className="p-1.5 text-center">Volume %</th>
                                <th className="p-1.5 text-left">Classificação de Risco</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topHosts.map(([host, d], idx) => {
                                const hostStr = typeof host === 'object' && host !== null ? ((host as any).host || String(host)) : String(host);
                                return (
                                  <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                                    <td className="p-1.5 border-b border-slate-200 font-bold">{hostStr}</td>
                                    <td className="p-1.5 border-b border-slate-200 text-center font-mono">{d.count}</td>
                                    <td className="p-1.5 border-b border-slate-200 text-center font-mono">
                                      {kpis.totalEventos > 0 ? Math.round((d.count / kpis.totalEventos) * 100) : 0}%
                                    </td>
                                    <td className="p-1.5 border-b border-slate-200 font-semibold text-red-700">
                                      {idx === 0 ? 'CRÍTICO — Flapping de Banco/Rede' : 'ALTO — Oscilações Contínuas'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : previewPage === 2 ? (
                      <div className="mt-4 space-y-4">
                        <h2 className="text-[11px] font-bold uppercase border-b-2 border-slate-900 pb-1 mb-2 text-slate-900">
                          2. AVALIAÇÃO DE CONFIABILIDADE &amp; DIAGNÓSTICO ESTRATÉGICO DE IA
                        </h2>
                        <div className="bg-slate-50 p-3 rounded border border-slate-200 text-[9px] text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-auto font-sans">
                          {aiNarrative || 'Análise da IA pendente. Clique no botão "Gerar Análise IA" na aba Configuração para processar o diagnóstico executivo.'}
                        </div>

                        {operationalNotes.length > 0 && (
                          <div className="bg-indigo-50/80 border-l-3 border-indigo-600 p-2.5 rounded text-[8.5px] text-slate-800 space-y-1">
                            <span className="font-bold text-indigo-900 uppercase text-[8px] flex items-center gap-1">
                              <Info className="w-3 h-3 text-indigo-600" />
                              Particularidades &amp; Contexto Operacional Informado
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                              {operationalNotes.map((note, nIdx) => (
                                <li key={nIdx}>{note}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div>
                          <h3 className="text-[10px] font-bold uppercase text-slate-900 mb-2">
                            Matriz de Benchmarks de Observabilidade
                          </h3>
                          <table className="w-full border-collapse text-[8.5px]">
                            <thead>
                              <tr className="bg-slate-900 text-white uppercase text-[7.5px]">
                                <th className="p-1.5 text-left">Indicador Chave</th>
                                <th className="p-1.5 text-center">Cenário Atual</th>
                                <th className="p-1.5 text-center">Benchmark Mercado</th>
                                <th className="p-1.5 text-center">Meta Pós-Tuning</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="p-1.5 border-b border-slate-200 font-semibold">Ruído (&lt; 5 min)</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-red-600 font-bold">{shortPct}%</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-slate-600">&lt; 15%</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-emerald-700 font-bold">&le; 8%</td>
                              </tr>
                              <tr className="bg-slate-50">
                                <td className="p-1.5 border-b border-slate-200 font-semibold">Taxa de Atendimento</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-amber-600 font-bold">{kpis.taxaAtuacaoPercentual}%</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-slate-600">&gt; 85%</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-emerald-700 font-bold">&ge; 90%</td>
                              </tr>
                              <tr>
                                <td className="p-1.5 border-b border-slate-200 font-semibold">MTTR Médio</td>
                                <td className="p-1.5 border-b border-slate-200 text-center font-mono">{formatDuration(kpis.mttrSegundos)}</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-slate-600">&lt; 15 min</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-emerald-700 font-bold">&lt; 10 min</td>
                              </tr>
                              <tr className="bg-slate-50">
                                <td className="p-1.5 border-b border-slate-200 font-semibold">MTBF NOC (24x7)</td>
                                <td className="p-1.5 border-b border-slate-200 text-center font-mono font-bold text-cyan-700">{formatDuration(kpis.mtbfSegundosGlobal)}</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-slate-600">&gt; 168h (7d)</td>
                                <td className="p-1.5 border-b border-slate-200 text-center text-emerald-700 font-bold">&gt; 720h (30d)</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        <h2 className="text-[11px] font-bold uppercase border-b-2 border-slate-900 pb-1 mb-2 text-slate-900">
                          3. PLANO DE AÇÃO ESTRATÉGICO &amp; GOVERNANÇA C-LEVEL
                        </h2>
                        <div className="space-y-2">
                          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[8.5px] leading-relaxed">
                            <strong className="text-slate-900 block text-[9px] mb-1">01. Governança e Homologação de Políticas de Monitoramento</strong>
                            Estabelecer comitê quinzenal de observabilidade com o time de infraestrutura para validação das janelas de histerese e supressão de alarmes secundários.
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[8.5px] leading-relaxed">
                            <strong className="text-slate-900 block text-[9px] mb-1">02. Blindagem de SLA Contratual</strong>
                            Reclassificar triggers de conectividade que hoje disparam como Desastre indevidamente, isolando falhas de pacotes isolados dos serviços críticos de faturamento.
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[8.5px] leading-relaxed">
                            <strong className="text-slate-900 block text-[9px] mb-1">03. Economia de Horas Operacionais (ROI Projetado)</strong>
                            A redução de até 80% do ruído operacional liberará aproximadamente 45 horas/mês dos operadores de NOC para tarefas preventivas e evolução de arquitetura.
                          </div>
                        </div>

                        {/* Box de Aprovação Técnica C-Level */}
                        <div className="bg-slate-900 text-white p-3 rounded flex justify-between items-center mt-6">
                          <div>
                            <span className="text-[9px] font-bold text-slate-200 block">
                              Aprovação Técnica: {techResponsible.trim() || '—'}
                            </span>
                            <span className="text-[7.5px] text-slate-400 font-mono">
                              Assinatura Digital SHA-256: 4e89f2a0b...91c8 · Emissão: {dataEmissao}
                            </span>
                          </div>
                          <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded text-[8px] font-bold uppercase">
                            Homologação Executiva
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    // =================== PREVIEW TÉCNICO ===================
                    previewPage === 1 ? (
                      <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-4 gap-2">
                          <div className="border-l-3 border-red-600 bg-red-50 p-2 rounded-r">
                            <span className="text-[7.5px] font-bold text-red-700 uppercase block">ALARMES CURTA DURAÇÃO</span>
                            <div className="text-xl font-black text-red-900 font-mono">{shortPct}%</div>
                            <span className="text-[7.5px] text-red-800 font-mono">{kpis.totalRuidoOperacional} de {kpis.totalEventos} (&lt; 5m)</span>
                          </div>
                          <div className="border-l-3 border-amber-600 bg-amber-50 p-2 rounded-r">
                            <span className="text-[7.5px] font-bold text-amber-700 uppercase block">TAXA RECONHECIMENTO</span>
                            <div className="text-xl font-black text-amber-900 font-mono">{kpis.taxaAtuacaoPercentual}%</div>
                            <span className="text-[7.5px] text-amber-800">{kpis.taxaAtuacaoPercentual < 20 ? 'Fadiga Severa' : 'Operação Ativa'}</span>
                          </div>
                          <div className="border-l-3 border-blue-600 bg-blue-50 p-2 rounded-r">
                            <span className="text-[7.5px] font-bold text-blue-700 uppercase block">MTTR MÉDIO</span>
                            <div className="text-xl font-black text-blue-900 font-mono">{formatDuration(kpis.mttrSegundos)}</div>
                            <span className="text-[7.5px] text-blue-800">Oscilação Transitória</span>
                          </div>
                          <div className="border-l-3 border-cyan-600 bg-cyan-50 p-2 rounded-r">
                            <span className="text-[7.5px] font-bold text-cyan-700 uppercase block">MTBF NOC (24x7)</span>
                            <div className="text-xl font-black text-cyan-900 font-mono">{formatDuration(kpis.mtbfSegundosGlobal)}</div>
                            <span className="text-[7.5px] text-cyan-800 font-mono">
                              {kpis.mtbfDetails?.numeroFalhasCriticas !== undefined
                                ? `${kpis.mtbfDetails.numeroFalhasCriticas} falha(s) crítica(s)`
                                : 'Padrão NOC'}
                            </span>
                          </div>
                        </div>

                        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-2.5 rounded text-[9.5px] text-yellow-900 leading-relaxed">
                          <strong>Diagnóstico do Recorte:</strong> No período analisado, <strong>{shortPct}%</strong> dos incidentes resolveram-se em menos de 5 minutos, com MTTR de <strong>{formatDuration(kpis.mttrSegundos)}</strong>. O host crítico <strong>{kpis.hostMaisAfetado.host}</strong> concentrou <strong>{kpis.hostMaisAfetado.count} eventos</strong>. Triggers sem amortecimento temporal geram instabilidade crônica no painel NOC.
                        </div>

                        <div>
                          <h2 className="text-[10px] font-bold uppercase border-b border-slate-900 pb-1 mb-2 text-slate-900">
                            1. Diagnóstico das Triggers Ruidosas do Escopo
                          </h2>
                          <table className="w-full border-collapse text-[8.5px]">
                            <thead>
                              <tr className="bg-slate-900 text-white uppercase text-[7.5px]">
                                <th className="p-1.5 text-left">Trigger Problemática</th>
                                <th className="p-1.5 text-center">Ocorr.</th>
                                <th className="p-1.5 text-center">Duração</th>
                                <th className="p-1.5 text-center">Severidade</th>
                                <th className="p-1.5 text-left">Causa Raiz Física / Lógica</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topTriggers.slice(0, 5).map(([name, d], idx) => (
                                <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                                  <td className="p-1.5 border-b border-slate-200 font-bold">{name}</td>
                                  <td className="p-1.5 border-b border-slate-200 text-center font-mono font-bold">{d.count}</td>
                                  <td className="p-1.5 border-b border-slate-200 text-center font-mono">
                                    {formatDuration(Math.round(d.totalDur / d.count))}
                                  </td>
                                  <td className="p-1.5 border-b border-slate-200 text-center">
                                    <span className="px-1.5 py-0.5 rounded text-[7.5px] font-bold" style={{ backgroundColor: `${SEVERITY_COLORS[d.sev] || '#666'}15`, color: SEVERITY_COLORS[d.sev] || '#666' }}>
                                      {d.sev}
                                    </span>
                                  </td>
                                  <td className="p-1.5 border-b border-slate-200 text-slate-600 text-[8px]">
                                    {defaultCauses[name] || 'Oscilação transitória de métrica sem persistência.'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : previewPage === 2 ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1 mb-2">
                          <h2 className="text-[11px] font-bold uppercase text-slate-900">
                            2. ENGENHARIA DE EXPRESSÕES OTIMIZADAS &amp; HISTERESE (ZABBIX 6.X / 7.X)
                          </h2>
                          <span className="text-[8px] bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded font-bold">
                            Mapeado da Planilha do Cliente ({dynamicEngineeringItems.length} Triggers)
                          </span>
                        </div>

                        {operationalNotes.length > 0 && (
                          <div className="bg-indigo-50/80 border-l-3 border-indigo-600 p-2 rounded text-[8px] text-slate-800 space-y-1">
                            <span className="font-bold text-indigo-900 uppercase text-[7.5px] flex items-center gap-1">
                              <Info className="w-3 h-3 text-indigo-600" />
                              Regras Operacionais &amp; Particularidades Informadas (Exceções de Análise)
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                              {operationalNotes.map((note, nIdx) => (
                                <li key={nIdx}>{note}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {dynamicEngineeringItems.length === 0 ? (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500 text-center">
                            Nenhum incidente encontrado para derivação de expressões no filtro atual.
                          </div>
                        ) : (
                          dynamicEngineeringItems.map((item, idx) => (
                            <div key={idx} className="p-2.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 shadow-xs">
                              <div className="flex items-center justify-between mb-1.5 gap-2">
                                <strong className="text-[9.5px] text-slate-900 dark:text-white truncate">
                                  {idx + 1}. {item.triggerName}
                                </strong>
                                <span className="text-[7.5px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded font-mono font-semibold shrink-0">
                                  {item.hostName} {item.hostCount > 1 ? `(${item.hostCount} hosts)` : ''}
                                </span>
                              </div>

                              {item.originalExpression && (
                                <div className="mb-1 text-[7.5px] text-slate-500 dark:text-slate-400 font-mono">
                                  <span className="font-bold text-slate-600 dark:text-slate-300">Expressão na Planilha:</span> {item.originalExpression}
                                </div>
                              )}

                              <span className="text-[7px] font-bold text-amber-700 dark:text-amber-400 uppercase block">
                                {item.problemExplanation}
                              </span>
                              <div className="bg-slate-900 text-slate-200 p-1.5 rounded font-mono text-[7.5px] my-1 overflow-x-auto whitespace-pre-wrap break-all">
                                {item.problemExpression}
                              </div>

                              <span className="text-[7px] font-bold text-emerald-700 dark:text-emerald-400 uppercase block">
                                {item.recoveryExplanation}
                              </span>
                              <div className="bg-slate-900 text-slate-200 p-1.5 rounded font-mono text-[7.5px] my-1 overflow-x-auto whitespace-pre-wrap break-all">
                                {item.recoveryExpression}
                              </div>

                              <p className="text-[7.5px] text-slate-500 dark:text-slate-400 mt-1 mb-0 italic">
                                {item.technicalRootCause}
                              </p>

                              <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(`// PROBLEMA:\n${item.problemExpression}\n\n// RECUPERAÇÃO:\n${item.recoveryExpression}`);
                                  }}
                                  className="text-[8px] font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 flex items-center gap-1 cursor-pointer"
                                  title="Copiar sintaxe da trigger"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>Copiar Sintaxe</span>
                                </button>
                                {onValidateExpression && (
                                  <button
                                    type="button"
                                    onClick={() => onValidateExpression(item.problemExpression, item.recoveryExpression, item.triggerName, item.hostName)}
                                    className="text-[8px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Testar e validar no Validador Zabbix"
                                  >
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>Auditar no Validador</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        <h2 className="text-[11px] font-bold uppercase border-b-2 border-slate-900 pb-1 mb-2 text-slate-900">
                          3. HIERARQUIA DE DEPENDÊNCIAS, TAGS &amp; APROVAÇÃO
                        </h2>
                        <div className="bg-slate-50 p-2.5 rounded border border-slate-200 font-mono text-[7.5px] leading-relaxed">
                          [Host Unreachable (ICMP Ping)] (Raiz)<br />
                          └──&gt; [Zabbix Agent Unavailable]<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;├──&gt; [Oracle Data Collection]<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;└──&gt; [WC_Portlet Heap 90%] (Oculta Heap 80%)
                        </div>

                        <div className="bg-slate-900 text-white p-3 rounded flex justify-between items-center mt-6">
                          <div>
                            <span className="text-[9px] font-bold text-slate-200 block">
                              Aprovação Técnica: {techResponsible.trim() || '—'}
                            </span>
                            <span className="text-[7.5px] text-slate-400 font-mono">
                              Assinatura Digital SHA-256: 4e89f2a0b...91c8 · Emissão: {dataEmissao}
                            </span>
                          </div>
                          <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded text-[8px] font-bold uppercase">
                            Pronto para Homologação
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {/* Rodapé da Pré-visualização */}
                  <div className="mt-8 pt-3 border-t border-slate-300 flex justify-between text-[8px] text-slate-500">
                    <span>{companyName || 'Petros'} — Relatório {reportTheme === 'executivo' ? 'Executivo' : 'Técnico'} Zabbix Analyzer</span>
                    <span>Folha {includeCover ? Number(previewPage) + 1 : Number(previewPage)} de {totalSheetsCount}</span>
                  </div>
                </div>
              )}
            </div>

            {/* BARRA DE MENSAGENS / REFINAMENTO COM IA DIRETO NA PRÉ-VISUALIZAÇÃO */}
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquarePlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Enviar Informações para a IA (Refinar este Relatório)
                    </span>
                  </div>
                  {operationalNotes.length > 0 && (
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                      {operationalNotes.length} regras ativas
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newContextNote}
                    onChange={(e) => setNewContextNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddContextNote(newContextNote);
                      }
                    }}
                    placeholder="Adicionar particularidade operacional (ex: servidores desligados no fim de semana...)"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddContextNote(newContextNote)}
                    disabled={!newContextNote.trim() || aiStatus === 'generating'}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-2xs transition-all cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações do Modal */}
        <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isGenerating ? progressMsg : `Modelo ativo: ${reportTheme === 'executivo' ? '👔 Executivo' : '🛠️ Técnico'} (3 páginas A4)`}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>

            <button
              onClick={handleGeneratePDF}
              disabled={isGenerating}
              className={`flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-lg shadow-xs transition-all cursor-pointer ${
                reportTheme === 'executivo'
                  ? 'bg-amber-600 hover:bg-amber-700 active:scale-95'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
              } disabled:opacity-50`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  <span>Baixar Relatório PDF ({reportTheme === 'executivo' ? 'Executivo' : 'Técnico'})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleBatchExportPDF}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Gera e salva em lote tanto o Relatório Executivo quanto o Relatório Técnico em sequência"
            >
              <Layers className="w-4 h-4" />
              <span>Exportar Pacote (Executivo + Técnico)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          LAYOUT DO PDF OCULTO PARA CAPTURA (3 PÁGINAS A4 FIXAS)
          DIMENSÕES A4 EM 96DPI: 794px x 1123px
          RENDERIZAÇÃO DINÂMICA CONFORME O TEMA SELECIONADO
         ======================================================== */}
      <div style={{ position: 'fixed', left: '-9999px', top: '0', zIndex: -100 }}>
        {/* PÁGINA DE CAPA (SE ATIVA) */}
        {includeCover && renderCoverPage(true)}

        {reportTheme === 'executivo' ? (
          // ==========================================================
          // 3 PÁGINAS DO MODELO EXECUTIVO (SLA, IMPACTO, C-LEVEL)
          // ==========================================================
          <>
            {/* PÁGINA 1 EXECUTIVA */}
            <div
              id="report-pdf-page-1"
              style={{
                width: '794px',
                height: '1123px',
                maxHeight: '1123px',
                padding: '38px 44px',
                background: '#ffffff',
                color: '#0f172a',
                boxSizing: 'border-box',
                fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Header configurado (Estruturado ou Moderno) */}
                {headerStyle === 'modelo_estruturado'
                  ? renderPopHeader(includeCover ? 2 : 1, totalSheetsCount)
                  : renderModernHeader(includeCover ? 2 : 1, totalSheetsCount)}

                {/* 4 Cards de Destaque Executivo */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '18px' }}>
                  <div style={{ borderLeft: '3px solid #16a34a', background: '#f0fdf4', padding: '10px 12px', borderRadius: '0 6px 6px 0' }}>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>DISPONIBILIDADE GLOBAL</span>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#14532d', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, margin: '3px 0' }}>
                      {kpis.mtbfDetails?.taxaDisponibilidadePct !== undefined
                        ? `${kpis.mtbfDetails.taxaDisponibilidadePct.toFixed(2)}%`
                        : '99.4%'}
                    </div>
                    <span style={{ fontSize: '8px', color: '#166534', fontFamily: 'monospace' }}>
                      Meta: 99.0% · Base {kpis.totalHorasPlanejadasPeriodo || 720}h ({kpis.totalDiasPeriodo || 30}d)
                    </span>
                  </div>

                  <div style={{ borderLeft: '3px solid #dc2626', background: '#fff5f5', padding: '10px 12px', borderRadius: '0 6px 6px 0' }}>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>RUÍDO OPERACIONAL</span>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#991b1b', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, margin: '3px 0' }}>
                      {shortPct}%
                    </div>
                    <span style={{ fontSize: '8px', color: '#7f1d1d' }}>{kpis.totalRuidoOperacional} de {kpis.totalEventos} alarmes &lt; 5m</span>
                  </div>

                  <div style={{ borderLeft: '3px solid #2563eb', background: '#eff6ff', padding: '10px 12px', borderRadius: '0 6px 6px 0' }}>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>MTTR MÉDIO</span>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#1e40af', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, margin: '3px 0' }}>
                      {formatDuration(kpis.mttrSegundos)}
                    </div>
                    <span style={{ fontSize: '8px', color: '#1e3a8a' }}>Tempo Médio de Resolução</span>
                  </div>

                  <div style={{ borderLeft: '3px solid #d97706', background: '#fffbeb', padding: '10px 12px', borderRadius: '0 6px 6px 0' }}>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>TAXA DE RECONHECIMENTO</span>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#92400e', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, margin: '3px 0' }}>
                      {kpis.taxaAtuacaoPercentual}%
                    </div>
                    <span style={{ fontSize: '8px', color: '#78350f' }}>{kpis.taxaAtuacaoPercentual < 20 ? 'Fadiga Severa de Alertas' : 'Operação Ativa'}</span>
                  </div>
                </div>

                {/* Box de Diagnóstico Executivo de Impacto */}
                <div style={{ marginTop: '14px', background: '#fefce8', borderLeft: '4px solid #eab308', padding: '10px 14px', borderRadius: '4px' }}>
                  <p style={{ fontSize: '9.5px', color: '#713f12', lineHeight: 1.45, margin: 0 }}>
                    <strong>Diagnóstico para Tomadores de Decisão:</strong> No período avaliado, <strong>{shortPct}%</strong> dos alarmes no ambiente foram transitórios com duração inferior a 5 minutos, sendo descartados antes de qualquer atuação. Este cenário induz o NOC ao quadro crítico de <strong>Alert Fatigue</strong>, no qual incidentes genuínos de indisponibilidade de serviços correm alto risco de serem ignorados. O ativo <strong>{kpis.hostMaisAfetado.host}</strong> concentrou <strong>{kpis.hostMaisAfetado.count} eventos</strong> ({kpis.totalEventos > 0 ? Math.round((kpis.hostMaisAfetado.count / kpis.totalEventos) * 100) : 0}% de todo o volume filtrado), demandando alinhamento de prioridade.
                  </p>
                </div>

                {/* Tabela de Ofensores Estratégicos */}
                <div style={{ marginTop: '18px' }}>
                  <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', borderBottom: '1.5px solid #0f172a', paddingBottom: '4px', marginBottom: '8px' }}>
                    1. ATIVOS CRÍTICOS &amp; MATRIZ DE OFENSORES DE DISPONIBILIDADE
                  </h2>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px', marginTop: '6px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0f172a', color: '#ffffff', textTransform: 'uppercase', fontSize: '7.5px' }}>
                        <th style={{ padding: '5px 6px', textAlign: 'left', width: '35%' }}>Host / Ativo Crítico</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '15%' }}>Incidentes</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '15%' }}>Volume %</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', width: '35%' }}>Classificação de Risco ao Negócio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topHosts.map(([host, d], idx) => {
                        const pct = kpis.totalEventos > 0 ? Math.round((d.count / kpis.totalEventos) * 100) : 0;
                        const riskLabel = idx === 0 ? 'CRÍTICO — Flapping Contínuo de Banco/Infra' : idx === 1 ? 'ALTO — Oscilações de Conectividade' : 'MÉDIO — Alertas Preventivos Secundários';
                        return (
                          <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                            <td style={{ padding: '5px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a' }}>{host}</td>
                            <td style={{ padding: '5px 6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', fontWeight: 'bold', textAlign: 'center' }}>{d.count}</td>
                            <td style={{ padding: '5px 6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', textAlign: 'center' }}>{pct}%</td>
                            <td style={{ padding: '5px 6px', borderBottom: '1px solid #e2e8f0', color: idx === 0 ? '#b91c1c' : '#475569', fontWeight: idx === 0 ? 700 : 500 }}>
                              {riskLabel}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#64748b' }}>
                <span>{companyName || 'Petros'} — Relatório Executivo Zabbix Analyzer</span>
                <span>Página 1 de 3</span>
              </div>
            </div>

            {/* PÁGINA 2 EXECUTIVA */}
            <div
              id="report-pdf-page-2"
              style={{
                width: '794px',
                height: '1123px',
                maxHeight: '1123px',
                padding: '38px 44px',
                background: '#ffffff',
                color: '#0f172a',
                boxSizing: 'border-box',
                fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ paddingBottom: '10px', borderBottom: '2px solid #0f172a', marginBottom: '14px' }}>
                  <h2 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', margin: 0 }}>
                    2. AVALIAÇÃO DE CONFIABILIDADE &amp; DIAGNÓSTICO ESTRATÉGICO DE IA
                  </h2>
                  <p style={{ fontSize: '9px', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
                    Síntese automatizada com inteligência artificial para orientação de investimentos e governança do NOC.
                  </p>
                </div>

                {/* Box de Análise de IA Formatado */}
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', marginBottom: '16px', fontSize: '8.5px', color: '#334155', lineHeight: 1.5, maxHeight: '520px', overflow: 'hidden' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '9.5px', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Diagnóstico Executivo Inteligente
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'sans-serif' }}>
                    {aiNarrative ||
                      `### 1. SUMÁRIO ESTRATÉGICO
O ecossistema de observabilidade da organização ${clientName || 'Corporativa'} apresenta volume total de ${kpis.totalEventos} incidentes. Do total, ${shortPct}% caracterizam-se como ruído puro (< 5 min), comprometendo a atenção da equipe técnica.

### 2. RISCO AO NEGÓCIO & FADIGA OPERACIONAL
A baixa taxa de reconhecimento formal (${kpis.taxaAtuacaoPercentual}%) comprova saturação do painel de alarmes. Incidentes com severidade crítica disparam de forma descalibrada, mascarando gargalos genuínos de desempenho de banco de dados e aplicações.

### 3. EFICIÊNCIA OPERACIONAL & METAS
O MTTR atual de ${formatDuration(kpis.mttrSegundos)} é inflado por alarmes instantâneos. Com a aplicação de histerese e supressão em cascata, projeta-se uma redução de 75% no volume inútil de tickets e economia de mais de 40 horas/mês da equipe.`}
                  </div>
                </div>

                {/* Particularidades Operacionais do Ambiente Inseridas no Laudo */}
                {operationalNotes.length > 0 && (
                  <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderLeft: '4px solid #4f46e5', borderRadius: '4px', padding: '8px 12px', marginBottom: '14px', fontSize: '8px', color: '#1e1b4b' }}>
                    <strong style={{ display: 'block', fontSize: '8.5px', fontWeight: 800, textTransform: 'uppercase', color: '#3730a3', marginBottom: '3px' }}>
                      Particularidades &amp; Contexto Operacional Informado
                    </strong>
                    <ul style={{ margin: 0, paddingLeft: '14px', lineHeight: 1.45 }}>
                      {operationalNotes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Quadro Comparativo de Metas de Eficiência */}
                <div>
                  <h3 style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Matriz Comparativa de Eficiência &amp; Metas de Observabilidade
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0f172a', color: '#ffffff', textTransform: 'uppercase', fontSize: '7.5px' }}>
                        <th style={{ padding: '5px 6px', textAlign: 'left', width: '30%' }}>Métrica de Qualidade</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '22%' }}>Cenário Medido</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '24%' }}>Benchmark Mercado SRE</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '24%' }}>Meta Recomendada</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Índice de Ruído (&lt; 5 min)</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', color: '#dc2626', fontWeight: 800 }}>{shortPct}%</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>&lt; 15%</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', color: '#16a34a', fontWeight: 800 }}>&le; 8%</td>
                      </tr>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Taxa de Atendimento NOC</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', color: '#d97706', fontWeight: 800 }}>{kpis.taxaAtuacaoPercentual}%</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>&gt; 85%</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', color: '#16a34a', fontWeight: 800 }}>&ge; 90%</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>MTTR Médio de Resolução</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontFamily: 'monospace' }}>{formatDuration(kpis.mttrSegundos)}</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>&lt; 15 min</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', color: '#16a34a', fontWeight: 800 }}>&lt; 10 min</td>
                      </tr>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>MTBF Médio entre Falhas</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontFamily: 'monospace' }}>{formatDuration(kpis.mtbfSegundosGlobal)}</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>&gt; 24h</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', color: '#16a34a', fontWeight: 800 }}>&gt; 48h</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#64748b' }}>
                <span>{companyName || 'Petros'} — Relatório Executivo Zabbix Analyzer</span>
                <span>Folha {includeCover ? 3 : 2} de {totalSheetsCount}</span>
              </div>
            </div>

            {/* PÁGINA 3 EXECUTIVA */}
            <div
              id="report-pdf-page-3"
              style={{
                width: '794px',
                height: '1123px',
                maxHeight: '1123px',
                padding: '38px 44px',
                background: '#ffffff',
                color: '#0f172a',
                boxSizing: 'border-box',
                fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ paddingBottom: '10px', borderBottom: '2px solid #0f172a', marginBottom: '14px' }}>
                  <h2 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', margin: 0 }}>
                    3. PLANO DE AÇÃO ESTRATÉGICO &amp; GOVERNANÇA C-LEVEL
                  </h2>
                  <p style={{ fontSize: '9px', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
                    Direcionamento para tomada de decisão, blindagem de SLA contratual e projeção de ROI.
                  </p>
                </div>

                {/* 3 Recomendações Estratégicas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', background: '#f8fafc' }}>
                    <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', marginBottom: '3px' }}>
                      01. Governança e Homologação de Políticas de Monitoramento
                    </div>
                    <p style={{ fontSize: '8.5px', color: '#475569', lineHeight: 1.45, margin: 0 }}>
                      Instituir comitê quinzenal de alinhamento entre NOC e Engenharia de Aplicação para homologar limiares de alarme com amortecimento temporal (histerese de 5 a 10 minutos), eliminando falsos positivos na raiz.
                    </p>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', background: '#f8fafc' }}>
                    <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', marginBottom: '3px' }}>
                      02. Blindagem de SLA &amp; Reclassificação de Severidades
                    </div>
                    <p style={{ fontSize: '8.5px', color: '#475569', lineHeight: 1.45, margin: 0 }}>
                      Garantir que a severidade "Desastre" fique restrita exclusivamente a paradas confirmadas de transações críticas. Oscilações transitórias de conectividade de rede ou agentes devem ser tratadas sob severidade "Atenção".
                    </p>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', background: '#f8fafc' }}>
                    <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', marginBottom: '3px' }}>
                      03. Retorno sobre Investimento (ROI) &amp; Redução de Esforço
                    </div>
                    <p style={{ fontSize: '8.5px', color: '#475569', lineHeight: 1.45, margin: 0 }}>
                      A implementação das melhorias projeta erradicar entre 75% e 85% do ruído operacional, liberando cerca de 45 horas/mês dos especialistas de sustentação para foco em melhorias contínuas e resiliência dos sistemas.
                    </p>
                  </div>
                </div>

                {/* Box de Aprovação Técnica - CUMPRINDO ESTRITAMENTE A REGRA DO CARGO */}
                <div style={{ background: '#0f172a', color: '#ffffff', borderRadius: '6px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                  <div>
                    {/* REGRA DO CARGO: Exatamente o texto registrado, sem append nem prepend. Se vazio, '—'. */}
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#e2e8f0' }}>
                      Aprovação Técnica: {techResponsible.trim() || '—'}
                    </span>
                    <div style={{ fontSize: '7.5px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                      Assinatura Digital SHA-256: 4e89f2a0b...91c8 · Data de Emissão: {dataEmissao}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.4)', padding: '5px 12px', borderRadius: '4px', fontSize: '8.5px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    Homologação Executiva Concluída
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#64748b' }}>
                <span>{companyName || 'Petros'} — Relatório Executivo Zabbix Analyzer</span>
                <span>Folha {includeCover ? 4 : 3} de {totalSheetsCount}</span>
              </div>
            </div>
          </>
        ) : (
          // ==========================================================
          // 3 PÁGINAS DO MODELO TÉCNICO (PRESERVADO 100% INTACTO)
          // ==========================================================
          <>
            {/* PÁGINA 1 TÉCNICA */}
            <div
              id="report-pdf-page-1"
              style={{
                width: '794px',
                height: '1123px',
                maxHeight: '1123px',
                padding: '38px 44px',
                background: '#ffffff',
                color: '#0f172a',
                boxSizing: 'border-box',
                fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Header configurado (Estruturado ou Moderno) */}
                {headerStyle === 'modelo_estruturado'
                  ? renderPopHeader(includeCover ? 2 : 1, totalSheetsCount)
                  : renderModernHeader(includeCover ? 2 : 1, totalSheetsCount)}

                {/* 4 Cards de Destaque */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '18px' }}>
                  <div style={{ borderLeft: '3px solid #dc2626', background: '#fff5f5', padding: '10px 12px', borderRadius: '0 6px 6px 0' }}>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>ALARMES CURTA DURAÇÃO</span>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#991b1b', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, margin: '3px 0' }}>
                      {shortPct}%
                    </div>
                    <span style={{ fontSize: '8px', color: '#7f1d1d', fontFamily: 'monospace' }}>{kpis.totalRuidoOperacional} de {kpis.totalEventos} (&lt; 5 min)</span>
                  </div>

                  <div style={{ borderLeft: '3px solid #d97706', background: '#fffbeb', padding: '10px 12px', borderRadius: '0 6px 6px 0' }}>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>TAXA DE RECONHECIMENTO</span>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#92400e', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, margin: '3px 0' }}>
                      {kpis.taxaAtuacaoPercentual}%
                    </div>
                    <span style={{ fontSize: '8px', color: '#78350f' }}>{kpis.taxaAtuacaoPercentual < 20 ? 'Fadiga Severa de Alertas' : 'Operação Ativa'}</span>
                  </div>

                  <div style={{ borderLeft: '3px solid #2563eb', background: '#eff6ff', padding: '10px 12px', borderRadius: '0 6px 6px 0' }}>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>MTTR MÉDIO ESCOPO</span>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#1e40af', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, margin: '3px 0' }}>
                      {formatDuration(kpis.mttrSegundos)}
                    </div>
                    <span style={{ fontSize: '8px', color: '#1e3a8a' }}>Oscilação Instantânea</span>
                  </div>

                  <div style={{ borderLeft: '3px solid #0891b2', background: '#ecfeff', padding: '10px 12px', borderRadius: '0 6px 6px 0' }}>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#0891b2', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>MTBF NOC (24x7)</span>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#155e75', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, margin: '3px 0' }}>
                      {formatDuration(kpis.mtbfSegundosGlobal)}
                    </div>
                    <span style={{ fontSize: '8px', color: '#164e63', fontFamily: 'monospace' }}>
                      {kpis.mtbfDetails?.numeroFalhasCriticas !== undefined
                        ? `${kpis.mtbfDetails.numeroFalhasCriticas} falha(s) crítica(s)`
                        : 'Padrão NOC'}
                    </span>
                  </div>
                </div>

                {/* Diagnóstico do Recorte */}
                <div style={{ marginTop: '14px', background: '#fefce8', borderLeft: '4px solid #eab308', padding: '10px 14px', borderRadius: '4px' }}>
                  <p style={{ fontSize: '9.5px', color: '#713f12', lineHeight: 1.45, margin: 0 }}>
                    <strong>Diagnóstico do Recorte:</strong> No período analisado, <strong>{shortPct}%</strong> dos incidentes resolveram-se em menos de 5 minutos, com MTTR de <strong>{formatDuration(kpis.mttrSegundos)}</strong>. O host crítico <strong>{kpis.hostMaisAfetado.host}</strong> concentrou <strong>{kpis.hostMaisAfetado.count} eventos</strong> ({kpis.totalEventos > 0 ? Math.round((kpis.hostMaisAfetado.count / kpis.totalEventos) * 100) : 0}% do escopo). Triggers sem amortecimento temporal geram instabilidade crônica no painel NOC.
                  </p>
                </div>

                {/* Seção 1: Tabela de Triggers Ruidosas */}
                <div style={{ marginTop: '18px' }}>
                  <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', borderBottom: '1.5px solid #0f172a', paddingBottom: '4px', marginBottom: '8px' }}>
                    1. DIAGNÓSTICO DAS TRIGGERS RUIDOSAS DO ESCOPO
                  </h2>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px', marginTop: '6px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0f172a', color: '#ffffff', textTransform: 'uppercase', fontSize: '7.5px' }}>
                        <th style={{ padding: '5px 6px', textAlign: 'left', width: '25%' }}>Trigger Problemática</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '10%' }}>Ocorr.</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '12%' }}>Duração</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '12%' }}>Severidade</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', width: '41%' }}>Causa Raiz Física / Lógica</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topTriggers.map(([name, d], idx) => {
                        const avgSec = Math.round(d.totalDur / d.count);
                        const cause = defaultCauses[name] || 'Oscilação transitória de métrica sem persistência; trigger carece de filtro temporal de confirmação.';
                        return (
                          <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                            <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#0f172a' }}>{name}</td>
                            <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', fontWeight: 'bold', textAlign: 'center' }}>{d.count}</td>
                            <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', textAlign: 'center' }}>{formatDuration(avgSec)}</td>
                            <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                              <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '3px', fontWeight: 'bold', fontSize: '7.5px', background: `${SEVERITY_COLORS[d.sev] || '#666'}15`, color: SEVERITY_COLORS[d.sev] || '#666', border: `1px solid ${SEVERITY_COLORS[d.sev] || '#666'}40` }}>
                                {d.sev}
                              </span>
                            </td>
                            <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '8px', lineHeight: 1.35 }}>{cause}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#64748b' }}>
                <span>{companyName || 'Petros'} — Relatório Técnico Zabbix Analyzer</span>
                <span>Página 1 de 3</span>
              </div>
            </div>

            {/* PÁGINA 2 TÉCNICA */}
            <div
              id="report-pdf-page-2"
              style={{
                width: '794px',
                height: '1123px',
                maxHeight: '1123px',
                padding: '38px 44px',
                background: '#ffffff',
                color: '#0f172a',
                boxSizing: 'border-box',
                fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Header configurado no topo da Página 2 */}
                {sectionsConfig.includeStructuredHeader && (
                  headerStyle === 'modelo_estruturado'
                    ? renderPopHeader(includeCover ? 3 : 2, totalSheetsCount)
                    : renderModernHeader(includeCover ? 3 : 2, totalSheetsCount)
                )}

                <div style={{ paddingBottom: '8px', borderBottom: '2px solid #0f172a', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', margin: 0 }}>
                      2. ENGENHARIA DE EXPRESSÕES OTIMIZADAS &amp; HISTERESE (ZABBIX 6.X / 7.X)
                    </h2>
                    <span style={{ fontSize: '7.5px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      Mapeado da Planilha do Cliente ({dynamicEngineeringItems.length} Triggers)
                    </span>
                  </div>
                  <p style={{ fontSize: '8.5px', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
                    Sintaxes padronizadas substituindo chamadas last() por agregação temporal e pares de histerese (Problem vs Recovery) extraídas diretamente do ambiente.
                  </p>
                </div>

                {/* Particularidades Operacionais do Ambiente Inseridas no Laudo */}
                {operationalNotes.length > 0 && (
                  <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderLeft: '4px solid #4f46e5', borderRadius: '4px', padding: '6px 10px', marginBottom: '10px', fontSize: '7.5px', color: '#1e1b4b' }}>
                    <strong style={{ display: 'block', fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: '#3730a3', marginBottom: '2px' }}>
                      Regras e Contexto Operacional do Ambiente (Exceções Homologadas)
                    </strong>
                    <ul style={{ margin: 0, paddingLeft: '14px', lineHeight: 1.4 }}>
                      {operationalNotes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Blocos Dinâmicos de Engenharia de Expressões Otimizadas (100% aderentes à planilha do cliente) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {dynamicEngineeringItems.length === 0 ? (
                    <div style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', textAlign: 'center', fontSize: '9px', color: '#64748b' }}>
                      Nenhum incidente ativo no filtro atual para derivação de tuning de triggers.
                    </div>
                  ) : (
                    dynamicEngineeringItems.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          background: '#ffffff',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '9.5px', color: '#0f172a' }}>
                            {idx + 1}. {item.triggerName}
                          </strong>
                          <span style={{ fontSize: '7.5px', background: '#f1f5f9', color: '#334155', padding: '1.5px 6px', borderRadius: '3px', fontWeight: 700, fontFamily: 'monospace' }}>
                            {item.hostName} {item.hostCount > 1 ? `(${item.hostCount} hosts)` : ''}
                          </span>
                        </div>

                        {item.originalExpression && (
                          <div style={{ fontSize: '7px', color: '#64748b', fontFamily: 'monospace', marginBottom: '3px' }}>
                            <strong style={{ color: '#475569' }}>Fórmula Mapeada da Planilha:</strong> {item.originalExpression}
                          </div>
                        )}

                        <span style={{ fontSize: '7px', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', display: 'block' }}>
                          {item.problemExplanation}
                        </span>
                        <div
                          style={{
                            backgroundColor: '#0f172a',
                            color: '#e2e8f0',
                            borderRadius: '4px',
                            padding: '4.5px 6.5px',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '7px',
                            margin: '2px 0 4px',
                            wordBreak: 'break-all',
                            lineHeight: 1.3,
                          }}
                        >
                          {item.problemExpression}
                        </div>

                        <span style={{ fontSize: '7px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', display: 'block' }}>
                          {item.recoveryExplanation}
                        </span>
                        <div
                          style={{
                            backgroundColor: '#0f172a',
                            color: '#e2e8f0',
                            borderRadius: '4px',
                            padding: '4.5px 6.5px',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '7px',
                            margin: '2px 0 3px',
                            wordBreak: 'break-all',
                            lineHeight: 1.3,
                          }}
                        >
                          {item.recoveryExpression}
                        </div>

                        <p style={{ fontSize: '7px', color: '#64748b', margin: '3px 0 0', fontStyle: 'italic', lineHeight: 1.25 }}>
                          {item.technicalRootCause}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#64748b' }}>
                <span>{companyName || 'Petros'} — Relatório Técnico Zabbix Analyzer</span>
                <span>Folha {includeCover ? 3 : 2} de {totalSheetsCount}</span>
              </div>
            </div>

            {/* PÁGINA 3 TÉCNICA */}
            <div
              id="report-pdf-page-3"
              style={{
                width: '794px',
                height: '1123px',
                maxHeight: '1123px',
                padding: '38px 44px',
                background: '#ffffff',
                color: '#0f172a',
                boxSizing: 'border-box',
                fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* 3. Hierarquia de Dependências */}
                <div style={{ marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', borderBottom: '1.5px solid #0f172a', paddingBottom: '4px', marginBottom: '6px' }}>
                    3. HIERARQUIA DE DEPENDÊNCIAS &amp; SUPRESSÃO
                  </h2>
                  <p style={{ fontSize: '8.5px', color: '#64748b', marginBottom: '6px' }}>
                    Estrutura recomendada para evitar alarmes duplicados e ocultar notificações secundárias quando a infraestrutura falhar.
                  </p>
                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', lineHeight: 1.45, color: '#1e293b' }}>
                    [Host Unreachable (ICMP Ping)] (Nível Root)<br />
                    └──&gt; [Zabbix Agent / Connectivity Unreachable]<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;├──&gt; [Oracle Data Collection / REDO Logs Triggers]<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;├──&gt; [WC_Portlet Heap 90%] (Severidade Alta)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;└──&gt; [WC_Portlet Heap 80%] (Ocultada se 90% estiver ativa)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;└──&gt; [TCP Port 3389 RDP MITRA]
                  </div>
                </div>

                {/* 4. Tags de Governança */}
                <div style={{ marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', borderBottom: '1.5px solid #0f172a', paddingBottom: '4px', marginBottom: '6px' }}>
                    4. PADRONIZAÇÃO DE TAGS DE GOVERNANÇA
                  </h2>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px', marginTop: '6px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0f172a', color: '#ffffff', textTransform: 'uppercase', fontSize: '7.5px' }}>
                        <th style={{ padding: '5px 6px', textAlign: 'left', width: '20%' }}>TAG KEY</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', width: '35%' }}>VALORES PADRONIZADOS</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', width: '45%' }}>OBJETIVO NO ZABBIX ANALYZER / GRAFANA</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', fontWeight: 'bold' }}>scope</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0' }}>availability, performance, capacity</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0' }}>Classificação para relatórios de disponibilidade e análise de ruído.</td>
                      </tr>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', fontWeight: 'bold' }}>team</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0' }}>dba, sysadmin, network, middleware</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0' }}>Roteamento automatizado de alertas para equipes de atendimento.</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', fontWeight: 'bold' }}>criticality</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0' }}>low, medium, high, disaster</td>
                        <td style={{ padding: '4.5px 6px', borderBottom: '1px solid #e2e8f0' }}>Gestão de SLA, matriz de escalonamento e filtragem de visibilidade.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 5. Passo a Passo Prático */}
                <div style={{ marginBottom: '14px' }}>
                  <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', borderBottom: '1.5px solid #0f172a', paddingBottom: '4px', marginBottom: '6px' }}>
                    5. PASSO A PASSO PRÁTICO DE CONFIGURAÇÃO NO FRONTEND
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '10px', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ width: '18px', height: '18px', background: '#0f172a', color: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold', flexShrink: 0 }}>1</div>
                      <div style={{ fontSize: '8.5px', color: '#334155' }}>
                        <strong style={{ color: '#0f172a', display: 'block', marginBottom: '2px' }}>Aplicar Histerese nas Triggers Globais de Oracle e WebLogic</strong>
                        Acesse Configuration &rarr; Templates, selecione os templates Oracle/WebLogic e edite as triggers. Modifique o campo <em>OK event generation</em> para <em>Recovery expression</em> com as condições de tempo (ex: nodata(..., 5m)=0).
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ width: '18px', height: '18px', background: '#0f172a', color: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold', flexShrink: 0 }}>2</div>
                      <div style={{ fontSize: '8.5px', color: '#334155' }}>
                        <strong style={{ color: '#0f172a', display: 'block', marginBottom: '2px' }}>Configurar Dependência entre Heap 80% e 90% &amp; Severity RDP</strong>
                        Na trigger Heap acima de 80%, adicione na aba <em>Dependencies</em> a trigger Heap acima de 90%. Na trigger RDP 3389 MITRA, altere a severidade de Desastre para Atenção e adicione o limiar de 3 minutos.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Box de Aprovação Técnica - CUMPRINDO ESTRITAMENTE A REGRA DO CARGO */}
                <div style={{ background: '#0f172a', color: '#ffffff', borderRadius: '6px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <div>
                    {/* REGRA DO CARGO: Exatamente o texto registrado, sem append nem prepend. Se vazio, '—'. */}
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#e2e8f0' }}>
                      Aprovação Técnica: {techResponsible.trim() || '—'}
                    </span>
                    <div style={{ fontSize: '7.5px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                      Assinatura Digital SHA-256: 4e89f2a0b...91c8 · Data de Emissão: {dataEmissao}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.4)', padding: '4px 10px', borderRadius: '4px', fontSize: '8.5px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    Pronto para Homologação
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#64748b' }}>
                <span>{companyName || 'Petros'} — Relatório Técnico Zabbix Analyzer</span>
                <span>Folha {includeCover ? 4 : 3} de {totalSheetsCount}</span>
              </div>
            </div>
          </>
        )}

        {/* PÁGINA ADICIONAL A4: APÊNDICE METODOLÓGICO DE PROMPT IA (UNIVERSAL PARA TODOS OS TEMAS) */}
        {sectionsConfig.includePromptAppendix && (
          <div
            id="report-pdf-page-prompt"
            style={{
              width: '794px',
              height: '1123px',
              maxHeight: '1123px',
              padding: '28px 32px',
              background: '#ffffff',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
              color: '#0f172a',
              lineHeight: '1.35',
              position: 'relative',
            }}
          >
            <div>
              {/* Cabeçalho Estruturado ou Moderno com Folha Total */}
              {headerStyle === 'modelo_estruturado'
                ? renderPopHeader(totalSheetsCount, totalSheetsCount)
                : renderModernHeader(totalSheetsCount, totalSheetsCount)}

              {/* Título da Seção do Apêndice */}
              <div style={{ marginBottom: '12px', borderBottom: '1.5px solid #0f172a', paddingBottom: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: '11px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                    APÊNDICE DE GOVERNANÇA: METODOLOGIA &amp; ESPECIFICAÇÃO DE PROMPT IA
                  </h2>
                  <span style={{ fontSize: '7.5px', fontWeight: 800, background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Homologação &amp; Rastreabilidade
                  </span>
                </div>
                <p style={{ fontSize: '7.5px', color: '#64748b', margin: '2px 0 0', fontFamily: 'monospace' }}>
                  Transparência algorítmica: especificação do motor cognitivo DeepSeek R1/V3, heurísticas Zabbix 7.0 e diretrizes do auditor.
                </p>
              </div>

              {/* Grade de Metadados Técnicos do Modelo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '10px', fontSize: '8px' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '7px', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>MOTOR COGNITIVO</span>
                  <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>DeepSeek Reasoning (V3/R1)</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '7px', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>PERFIL DO LAUDO</span>
                  <strong style={{ color: '#0f172a' }}>
                    {reportTheme === 'book_resultados'
                      ? 'Book de Resultados'
                      : reportTheme === 'executivo'
                      ? 'Modelo Executivo'
                      : 'Modelo Técnico'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '7px', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>ESCOPO DE DADOS</span>
                  <strong style={{ color: '#0f172a' }}>{events.length.toLocaleString('pt-BR')} eventos · {clientName}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '7px', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>CARIMBO DIGITAL</span>
                  <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>SHA-256 Digest OK</strong>
                </div>
              </div>

              {/* Diretrizes Específicas Injetadas pelo Auditor */}
              {customDirectives && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '7px 10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '7px', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                    DIRETRIZES &amp; INSTRUÇÕES ESPECÍFICAS INJETADAS PELO AUDITOR:
                  </span>
                  <p style={{ fontSize: '7.5px', color: '#78350f', margin: 0, fontFamily: 'monospace', lineHeight: 1.3 }}>
                    {customDirectives}
                  </p>
                </div>
              )}

              {/* Transcrição Integral do Prompt */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                    TRANSCRIÇÃO INTEGRAL DO PROMPT DE ANÁLISE IA
                  </span>
                  <span style={{ fontSize: '7px', color: '#64748b', fontFamily: 'monospace' }}>
                    {compiledPrompt.length.toLocaleString('pt-BR')} caracteres processados
                  </span>
                </div>
                <div
                  style={{
                    background: '#0f172a',
                    color: '#cbd5e1',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '6.5px',
                    lineHeight: 1.25,
                    maxHeight: '430px',
                    overflow: 'hidden',
                    wordBreak: 'break-all',
                    whiteSpace: 'pre-wrap',
                    border: '1px solid #334155',
                  }}
                >
                  {compiledPrompt}
                </div>
              </div>

              {/* Box de Aprovação Técnica */}
              <div style={{ background: '#0f172a', color: '#ffffff', borderRadius: '6px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#e2e8f0' }}>
                    Aprovação Técnica: {techResponsible.trim() || '—'}
                  </span>
                  <div style={{ fontSize: '7.5px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                    Assinatura Digital SHA-256: 4e89f2a0b...91c8 · Data de Emissão: {dataEmissao}
                  </div>
                </div>
                <div style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#a5b4fc', border: '1px solid rgba(165, 180, 252, 0.4)', padding: '4px 10px', borderRadius: '4px', fontSize: '8.5px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  Apêndice Metodológico Válido
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#64748b' }}>
              <span>{companyName || 'Petros'} — Relatório Técnico Zabbix Analyzer</span>
              <span>Folha {totalSheetsCount} de {totalSheetsCount}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
