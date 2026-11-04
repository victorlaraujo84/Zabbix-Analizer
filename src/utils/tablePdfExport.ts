import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ZabbixEvent } from '../types/zabbix';
import { formatDuration, formatDateTimeBR } from './parser';

export interface EventsTablePDFOptions {
  events: ZabbixEvent[];
  clientName?: string;
  companyName?: string;
  activeFilters?: {
    dateFrom?: string;
    dateTo?: string;
    severidades?: string[];
    hosts?: string[];
    status?: string;
    reconhecido?: string;
    searchQuery?: string;
  };
  totalRawEvents?: number;
}

export function exportEventsTableToPDF(options: EventsTablePDFOptions): void {
  const {
    events,
    clientName = 'Cliente Corporativo',
    companyName = 'SNOC Observability Suite',
    activeFilters,
    totalRawEvents,
  } = options;

  // Cria documento PDF em modo paisagem (A4: 297mm x 210mm)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const marginX = 14;

  // 1. Faixa Superior Escura (Header Banner)
  doc.setFillColor(15, 23, 42); // #0F172A (Navy)
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Linha de realce azul
  doc.setFillColor(37, 99, 235); // #2563EB (Blue)
  doc.rect(0, 22, pageWidth, 1.2, 'F');

  // Título e Subtítulo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('RELATÓRIO TABULAR DE INCIDENTES ZABBIX', marginX, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // #94A3B8
  doc.text(`${companyName.toUpperCase()} · AUDITORIA DE OBSERVABILIDADE & CONFIABILIDADE`, marginX, 16);

  // Metadados à Direita no Banner
  const now = new Date();
  const dateStr = formatDateTimeBR(now);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(`EMISSÃO: ${dateStr}`, pageWidth - marginX, 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`CLIENTE: ${clientName.toUpperCase()}`, pageWidth - marginX, 16, { align: 'right' });

  // 2. Barra de Contexto & Filtros Ativos
  doc.setFillColor(241, 245, 249); // #F1F5F9 (Slate-100)
  doc.rect(marginX, 26, pageWidth - marginX * 2, 13, 'F');
  doc.setDrawColor(203, 213, 225); // #CBD5E1
  doc.rect(marginX, 26, pageWidth - marginX * 2, 13, 'S');

  // Monta resumo dos filtros ativos
  const filterTokens: string[] = [];
  if (activeFilters?.severidades && activeFilters.severidades.length > 0) {
    filterTokens.push(`Severidade: [${activeFilters.severidades.join(', ')}]`);
  }
  if (activeFilters?.status && activeFilters.status !== 'Todos') {
    filterTokens.push(`Status: ${activeFilters.status}`);
  }
  if (activeFilters?.reconhecido && activeFilters.reconhecido !== 'Todos') {
    filterTokens.push(`Reconhecido: ${activeFilters.reconhecido}`);
  }
  if (activeFilters?.hosts && activeFilters.hosts.length > 0) {
    filterTokens.push(`Hosts: ${activeFilters.hosts.length} selecionado(s)`);
  }
  if (activeFilters?.searchQuery && activeFilters.searchQuery.trim()) {
    filterTokens.push(`Busca: "${activeFilters.searchQuery.trim()}"`);
  }
  if (activeFilters?.dateFrom || activeFilters?.dateTo) {
    const f = activeFilters.dateFrom ? activeFilters.dateFrom.replace('T', ' ') : 'Início';
    const t = activeFilters.dateTo ? activeFilters.dateTo.replace('T', ' ') : 'Fim';
    filterTokens.push(`Período: ${f} até ${t}`);
  }

  const filterSummary = filterTokens.length > 0 ? filterTokens.join('  ·  ') : 'Sem restrições (Todos os eventos do período)';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  const totalCountStr = totalRawEvents ? `${events.length} de ${totalRawEvents}` : `${events.length}`;
  doc.text(`ESCOPO EXPORTADO: ${totalCountStr} incidentes`, marginX + 3, 31.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`FILTROS APLICADOS: ${filterSummary}`, marginX + 3, 36);

  // 3. Montagem das Linhas da Tabela
  const tableHead = [
    [
      'Data/Hora',
      'Host / Ativo',
      'Incidente / Trigger Zabbix',
      'Severidade',
      'Duração',
      'Status',
      'Reconhecido',
      'Tags',
    ],
  ];

  const tableBody = events.map((e) => {
    const dateFormatted = e.dataInicio ? formatDateTimeBR(e.dataInicio) : (e.hora || '-');
    const safeHost = typeof e.host === 'object' && e.host !== null
      ? ((e.host as any).host || String(e.host))
      : String(e.host || '-');

    const safeTrigger = typeof e.incidente === 'object' && e.incidente !== null
      ? ((e.incidente as any).trigger || (e.incidente as any).name || String(e.incidente))
      : String(e.incidente || '-');

    const durText = formatDuration(e.duracaoSegundos);
    const statusText = e.status === 'INCIDENTE' ? 'ABERTO' : 'RESOLVIDO';
    const recText = e.reconhecido === 'Sim' ? 'Sim' : 'Não';

    // Tags / Etiquetas resumidas
    let tagsText = '-';
    if (e.etiquetasTexto && e.etiquetasTexto.trim()) {
      tagsText = e.etiquetasTexto.slice(0, 35);
    } else if (e.etiquetas && typeof e.etiquetas === 'object') {
      tagsText = Object.entries(e.etiquetas)
        .map(([k, v]) => `${k}:${v}`)
        .slice(0, 2)
        .join(', ');
    }

    return [
      dateFormatted,
      safeHost,
      safeTrigger,
      e.severidade || 'Não classificada',
      durText,
      statusText,
      recText,
      tagsText,
    ];
  });

  // 4. Executa autoTable
  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: 42,
    margin: { left: marginX, right: marginX, bottom: 16 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.8,
      overflow: 'linebreak',
      textColor: [30, 41, 59], // #1E293B
      lineColor: [226, 232, 240], // #E2E8F0
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [15, 23, 42], // #0F172A
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // #F8FAFC
    },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' }, // Data/Hora
      1: { cellWidth: 38 },                   // Host
      2: { cellWidth: 'auto' },               // Incidente
      3: { cellWidth: 24, halign: 'center' }, // Severidade
      4: { cellWidth: 22, halign: 'center' }, // Duração
      5: { cellWidth: 22, halign: 'center' }, // Status
      6: { cellWidth: 20, halign: 'center' }, // Reconhecido
      7: { cellWidth: 34 },                   // Tags
    },
    didParseCell: (data) => {
      // Estilização semântica das células de severidade e status
      if (data.section === 'body') {
        // Coluna 3: Severidade
        if (data.column.index === 3) {
          const rawSev = String(data.cell.raw).toLowerCase();
          if (rawSev.includes('desastre')) {
            data.cell.styles.fillColor = [254, 226, 226]; // Red-100
            data.cell.styles.textColor = [185, 28, 28];   // Red-700
            data.cell.styles.fontStyle = 'bold';
          } else if (rawSev.includes('alta') || rawSev.includes('alto')) {
            data.cell.styles.fillColor = [255, 237, 213]; // Orange-100
            data.cell.styles.textColor = [194, 65, 12];   // Orange-700
            data.cell.styles.fontStyle = 'bold';
          } else if (rawSev.includes('méd') || rawSev.includes('med')) {
            data.cell.styles.fillColor = [254, 243, 199]; // Amber-100
            data.cell.styles.textColor = [180, 83, 9];    // Amber-700
            data.cell.styles.fontStyle = 'bold';
          } else if (rawSev.includes('aten') || rawSev.includes('aviso')) {
            data.cell.styles.fillColor = [219, 234, 254]; // Blue-100
            data.cell.styles.textColor = [29, 78, 216];   // Blue-700
          } else if (rawSev.includes('info')) {
            data.cell.styles.fillColor = [209, 250, 229]; // Emerald-100
            data.cell.styles.textColor = [4, 120, 87];    // Emerald-700
          }
        }

        // Coluna 5: Status
        if (data.column.index === 5) {
          const rawStatus = String(data.cell.raw);
          if (rawStatus === 'ABERTO') {
            data.cell.styles.fillColor = [254, 242, 242];
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [4, 120, 87];
          }
        }

        // Coluna 6: Reconhecido
        if (data.column.index === 6) {
          if (String(data.cell.raw) === 'Sim') {
            data.cell.styles.textColor = [180, 83, 9];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
    didDrawPage: (data) => {
      // Rodapé em todas as páginas: "Página X de Y" e identificação
      const totalPages = (doc as any).internal.getNumberOfPages();
      const currentPage = data.pageNumber;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // #94A3B8

      // Linha separadora de rodapé
      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);

      doc.text(
        `Confidencial · ${companyName} · Documento gerado em ${dateStr}`,
        marginX,
        pageHeight - 6
      );

      doc.text(
        `Página ${currentPage} de ${totalPages}`,
        pageWidth - marginX,
        pageHeight - 6,
        { align: 'right' }
      );
    },
  });

  // Salva e efetua o download do arquivo
  const cleanClient = clientName.replace(/[^a-zA-Z0-9]/g, '_');
  const dateFormattedCompact = now.toISOString().slice(0, 10);
  const timeFormattedCompact = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `Eventos_Zabbix_${cleanClient}_${dateFormattedCompact}_${timeFormattedCompact}.pdf`;

  doc.save(fileName);
}
