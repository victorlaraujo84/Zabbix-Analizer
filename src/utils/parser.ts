import * as XLSX from 'xlsx';
import { ZabbixEvent, ZabbixTriggerCatalogItem } from '../types/zabbix';

/**
 * Converte segundos inteiros para representação legível:
 * - < 60s   -> Xs
 * - < 3600s -> Xm Ys
 * - < 86400s -> Xh Ym
 * - >= 86400s -> Xd Yh Zm
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) {
    return '0s';
  }
  const s = Math.floor(seconds);
  if (s < 60) {
    return `${s}s`;
  }
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const remM = Math.floor((s % 3600) / 60);
    return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  }
  const d = Math.floor(s / 86400);
  const remH = Math.floor((s % 86400) / 3600);
  const remM = Math.floor((s % 3600) / 60);
  return `${d}d ${remH}h ${remM}m`;
}

/**
 * Converte texto ISO 8601 de duração (ex: PT4M, PT1H20M, PT59S, PT2H30M22S) em segundos.
 */
export function parseDurationISO(durationStr: string): number {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const str = durationStr.trim().toUpperCase();
  if (!str.startsWith('PT') && !str.startsWith('P')) return 0;

  const hoursMatch = str.match(/(\d+)H/);
  const minutesMatch = str.match(/(\d+)M/);
  const secondsMatch = str.match(/(\d+(?:\.\d+)?)S/);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const seconds = secondsMatch ? parseFloat(secondsMatch[1]) : 0;

  return hours * 3600 + minutes * 60 + Math.floor(seconds);
}

/**
 * Converte texto livre de duração (ex: "4m", "1h 20m", "0", "2h 30m 22s", "45s") em segundos.
 */
export function parseDurationText(durationText: string): number {
  if (!durationText || typeof durationText !== 'string') return 0;
  const clean = durationText.trim();
  if (clean === '0' || clean === '') return 0;

  let totalSeconds = 0;
  const dMatch = clean.match(/(\d+)\s*d/i);
  const hMatch = clean.match(/(\d+)\s*h/i);
  const mMatch = clean.match(/(\d+)\s*m/i);
  const sMatch = clean.match(/(\d+)\s*s/i);

  if (dMatch) totalSeconds += parseInt(dMatch[1], 10) * 86400;
  if (hMatch) totalSeconds += parseInt(hMatch[1], 10) * 3600;
  if (mMatch) totalSeconds += parseInt(mMatch[1], 10) * 60;
  if (sMatch) totalSeconds += parseInt(sMatch[1], 10);

  // Se não encontrou nenhuma unidade mas é um número puro em segundos
  if (!dMatch && !hMatch && !mMatch && !sMatch && !isNaN(Number(clean))) {
    return Math.floor(Number(clean));
  }

  return totalSeconds;
}

/**
 * Realiza parse de data nos formatos comuns do Zabbix:
 * 1. DD-MM-YYYY HH:mm:ss
 * 2. DD/MM/YYYY HH:mm:ss
 * 3. YYYY-MM-DD HH:mm:ss
 * 4. Número serial do Excel
 */
export function parseDate(dateVal: unknown): Date | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return dateVal;
  }

  // Número serial de data do Excel
  if (typeof dateVal === 'number') {
    const utcDays = Math.floor(dateVal - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = dateVal - Math.floor(dateVal) + 0.0000001;
    const totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return new Date(Date.UTC(dateInfo.getFullYear(), dateInfo.getMonth(), dateInfo.getDate(), hours, minutes, seconds));
  }

  if (typeof dateVal !== 'string') return null;
  const s = dateVal.trim();
  if (!s) return null;

  // Formato: DD-MM-YYYY HH:mm:ss ou DD/MM/YYYY HH:mm:ss
  const brMatch = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 0;
    const min = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    const sec = brMatch[6] ? parseInt(brMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  // Formato: YYYY-MM-DD HH:mm:ss ou ISO
  const isoMatch = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s](\d{2}):(\d{2}):(\d{2}))?$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
    const min = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const sec = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Formata um objeto Date ou string de data para o padrão brasileiro DD/MM/YYYY HH:mm:ss
 */
export function formatDateTimeBR(date: Date | null): string {
  if (!date || isNaN(date.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${d}/${m}/${y} ${h}:${min}:${s}`;
}

/**
 * Formata Date para input datetime-local (YYYY-MM-DDTHH:mm)
 */
export function toDateTimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

/**
 * Extrai tags no formato: chave: valor, chave: valor...
 */
export function parseTags(tagsStr: string): Record<string, string> {
  if (!tagsStr || typeof tagsStr !== 'string') return {};
  const tags: Record<string, string> = {};
  const parts = tagsStr.split(',');
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx > -1) {
      const key = part.slice(0, colonIdx).trim().toUpperCase();
      const val = part.slice(colonIdx + 1).trim();
      if (key) {
        tags[key] = val;
      }
    } else {
      const clean = part.trim();
      if (clean) {
        tags[clean] = '';
      }
    }
  }
  return tags;
}

/**
 * Normaliza string para comparação de nomes de colunas (sem acentos, minúsculo, sem pontuação)
 */
function normalizeHeaderName(val: unknown): string {
  if (!val) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Processa a planilha Excel (ArrayBuffer) e normaliza os eventos com suporte a até 15 colunas do Zabbix,
 * incluindo mapeamento flexível de cabeçalhos e tratamento especial para a coluna Expressão.
 */
export function parseZabbixWorkbook(buffer: ArrayBuffer): ZabbixEvent[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('O arquivo Excel não contém nenhuma planilha.');
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('A planilha está vazia.');
  }

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('A planilha não contém dados legíveis.');
  }

  // Detecta a linha de cabeçalho procurando por palavras-chave comuns de colunas do Zabbix
  let headerRowIndex = -1;
  let maxMatchedCols = 0;

  for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    let matches = 0;
    for (const cell of row) {
      const norm = normalizeHeaderName(cell);
      if (
        norm.includes('severidade') ||
        norm.includes('severity') ||
        norm.includes('host') ||
        norm.includes('incidente') ||
        norm.includes('expressao') ||
        norm.includes('expression') ||
        norm.includes('status') ||
        norm.includes('duracao') ||
        norm.includes('reconhecido') ||
        norm.includes('ack') ||
        norm.includes('etiquetas') ||
        norm.includes('tags')
      ) {
        matches++;
      }
    }

    if (matches >= 2 && matches > maxMatchedCols) {
      maxMatchedCols = matches;
      headerRowIndex = i;
    }
  }

  // Fallback caso a detecção heurística não tenha disparado
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
  }

  const headerRow = Array.isArray(rawRows[headerRowIndex]) ? rawRows[headerRowIndex] : [];

  // Mapeamento dinâmico de índices por nome de cabeçalho
  let colIdxSeveridade = -1;
  let colIdxHora = -1;
  let colIdxHoraRecup = -1;
  let colIdxStatus = -1;
  let colIdxHost = -1;
  let colIdxIncidente = -1;
  let colIdxExpressao = -1;
  let colIdxDuracao = -1;
  let colIdxReconhecido = -1;
  let colIdxAcoes = -1;
  let colIdxEtiquetas = -1;
  let colIdxHoraRecupISO = -1;
  let colIdxDuracaoISO = -1;
  let colIdxEventId = -1;
  let colIdxUsuario = -1;

  for (let j = 0; j < headerRow.length; j++) {
    const h = normalizeHeaderName(headerRow[j]);
    if (!h) continue;

    if ((h.includes('severidade') || h.includes('severity')) && colIdxSeveridade === -1) {
      colIdxSeveridade = j;
    } else if (
      (h.includes('expressao') || h.includes('expression') || h.includes('formula') || h.includes('sintaxe') || h.includes('condicao')) &&
      colIdxExpressao === -1
    ) {
      colIdxExpressao = j;
    } else if (
      (h.includes('recuperacaoiso') || h.includes('recoveryiso') || (h.includes('recup') && h.includes('iso'))) &&
      colIdxHoraRecupISO === -1
    ) {
      colIdxHoraRecupISO = j;
    } else if (
      (h.includes('duracaoiso') || h.includes('durationiso') || (h.includes('duracao') && h.includes('iso'))) &&
      colIdxDuracaoISO === -1
    ) {
      colIdxDuracaoISO = j;
    } else if (
      (h.includes('recuperacao') || h.includes('recovery') || h.includes('rclock') || h.includes('horafim') || h.includes('fim')) &&
      colIdxHoraRecup === -1
    ) {
      colIdxHoraRecup = j;
    } else if (
      (h.includes('hora') || h.includes('clock') || h.includes('tempo') || h.includes('time') || h.includes('inicio') || h.includes('datahora')) &&
      colIdxHora === -1
    ) {
      colIdxHora = j;
    } else if ((h.includes('status') || h.includes('estado')) && colIdxStatus === -1) {
      colIdxStatus = j;
    } else if ((h.includes('host') || h.includes('servidor') || h.includes('device') || h.includes('equipamento')) && colIdxHost === -1) {
      colIdxHost = j;
    } else if (
      (h.includes('incidente') || h.includes('problema') || h.includes('problem') || h.includes('alarme') || h.includes('trigger')) &&
      colIdxIncidente === -1
    ) {
      colIdxIncidente = j;
    } else if (
      (h.includes('duracao') || h.includes('duration') || h.includes('age') || h.includes('idade') || h.includes('tempodecorrido')) &&
      colIdxDuracao === -1
    ) {
      colIdxDuracao = j;
    } else if (
      (h.includes('reconhecido') || h.includes('reconhecimento') || h.includes('ack') || h.includes('acknowledged')) &&
      colIdxReconhecido === -1
    ) {
      colIdxReconhecido = j;
    } else if ((h.includes('acoes') || h.includes('actions') || h.includes('historico') || h.includes('mensagens')) && colIdxAcoes === -1) {
      colIdxAcoes = j;
    } else if ((h.includes('etiquetas') || h.includes('tags') || h.includes('labels')) && colIdxEtiquetas === -1) {
      colIdxEtiquetas = j;
    } else if ((h.includes('eventid') || h.includes('iddoevento') || h === 'id') && colIdxEventId === -1) {
      colIdxEventId = j;
    } else if ((h.includes('usuario') || h.includes('user') || h.includes('comentario') || h.includes('comments')) && colIdxUsuario === -1) {
      colIdxUsuario = j;
    }
  }

  // Fallback posicional inteligente para planilhas de 12 a 15 colunas sem cabeçalho padronizado
  const totalCols = headerRow.length;
  if (colIdxSeveridade === -1 && totalCols >= 1) colIdxSeveridade = 0;
  if (colIdxHora === -1 && totalCols >= 2) colIdxHora = 1;
  if (colIdxHoraRecup === -1 && totalCols >= 3) colIdxHoraRecup = 2;
  if (colIdxStatus === -1 && totalCols >= 4) colIdxStatus = 3;
  if (colIdxHost === -1 && totalCols >= 5) colIdxHost = 4;
  if (colIdxIncidente === -1 && totalCols >= 6) colIdxIncidente = 5;

  // Em planilhas com 15 colunas onde a coluna 6 é Expressão:
  if (totalCols >= 15 && colIdxExpressao === -1) {
    colIdxExpressao = 6;
    if (colIdxDuracao === -1) colIdxDuracao = 7;
    if (colIdxReconhecido === -1) colIdxReconhecido = 8;
    if (colIdxAcoes === -1) colIdxAcoes = 9;
    if (colIdxEtiquetas === -1) colIdxEtiquetas = 10;
    if (colIdxHoraRecupISO === -1) colIdxHoraRecupISO = 11;
    if (colIdxDuracaoISO === -1) colIdxDuracaoISO = 12;
    if (colIdxEventId === -1) colIdxEventId = 13;
    if (colIdxUsuario === -1) colIdxUsuario = 14;
  } else {
    // Ordem padrão de 12 colunas
    if (colIdxDuracao === -1 && totalCols >= 7) colIdxDuracao = 6;
    if (colIdxReconhecido === -1 && totalCols >= 8) colIdxReconhecido = 7;
    if (colIdxAcoes === -1 && totalCols >= 9) colIdxAcoes = 8;
    if (colIdxEtiquetas === -1 && totalCols >= 10) colIdxEtiquetas = 9;
    if (colIdxHoraRecupISO === -1 && totalCols >= 11) colIdxHoraRecupISO = 10;
    if (colIdxDuracaoISO === -1 && totalCols >= 12) colIdxDuracaoISO = 11;
  }

  const dataRows = rawRows.slice(headerRowIndex + 1);
  if (dataRows.length === 0) {
    throw new Error('O arquivo contém cabeçalho mas nenhuma linha de incidentes.');
  }

  const events: ZabbixEvent[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!Array.isArray(row) || row.every((c) => String(c).trim() === '')) {
      continue; // Ignora linhas em branco
    }

    const colA_severidade = colIdxSeveridade !== -1 ? String(row[colIdxSeveridade] || '').trim() : '';
    const colB_hora = colIdxHora !== -1 ? String(row[colIdxHora] || '').trim() : '';
    const colC_horaRecup = colIdxHoraRecup !== -1 ? String(row[colIdxHoraRecup] || '').trim() : '';
    const colD_status = colIdxStatus !== -1 ? String(row[colIdxStatus] || '').trim().toUpperCase() : '';
    const colE_host = colIdxHost !== -1 ? String(row[colIdxHost] || '').trim() : '';
    const colF_incidenteRaw = colIdxIncidente !== -1 ? String(row[colIdxIncidente] || '').trim() : '';
    const colExpressaoRaw = colIdxExpressao !== -1 ? String(row[colIdxExpressao] || '').trim() : '';
    const colG_duracao = colIdxDuracao !== -1 ? String(row[colIdxDuracao] || '').trim() : '';
    const colH_reconhecido = colIdxReconhecido !== -1 ? String(row[colIdxReconhecido] || '').trim() : '';
    const colI_acoes = colIdxAcoes !== -1 ? String(row[colIdxAcoes] || '').trim() : '';
    const colJ_etiquetas = colIdxEtiquetas !== -1 ? String(row[colIdxEtiquetas] || '').trim() : '';
    const colK_horaRecupISO = colIdxHoraRecupISO !== -1 ? String(row[colIdxHoraRecupISO] || '').trim() : '';
    const colL_duracaoISO = colIdxDuracaoISO !== -1 ? String(row[colIdxDuracaoISO] || '').trim() : '';
    const colM_eventId = colIdxEventId !== -1 ? String(row[colIdxEventId] || '').trim() : '';
    const colN_usuario = colIdxUsuario !== -1 ? String(row[colIdxUsuario] || '').trim() : '';

    // Se nem host, nem severidade e nem incidente existem, pula linha
    if (!colA_severidade && !colE_host && !colF_incidenteRaw && !colExpressaoRaw) {
      continue;
    }

    // REGRA DE OURO DO USUÁRIO: "considerar a coluna Expressão como o conteudo da trigger (Coluna Incidente)"
    let finalIncidente = colF_incidenteRaw;
    let finalExpressao = colExpressaoRaw;

    if (colExpressaoRaw) {
      // Se há coluna Expressão informada, se o incidente estiver vazio ou se Expressão for o conteúdo primário
      if (!finalIncidente || finalIncidente === 'Incidente sem descrição') {
        finalIncidente = colExpressaoRaw;
      }
      finalExpressao = colExpressaoRaw;
    } else if (finalIncidente && (finalIncidente.includes('last(') || finalIncidente.includes('avg(') || finalIncidente.includes('min(') || finalIncidente.includes('nodata(') || finalIncidente.includes('/') && finalIncidente.includes('>'))) {
      // Se a própria coluna Incidente já for uma expressão sintática Zabbix
      finalExpressao = finalIncidente;
    }

    // Normalização de datas
    const dataInicio = parseDate(colB_hora);
    const dataFim = parseDate(colC_horaRecup || colK_horaRecupISO);

    // Normalização de duração
    let duracaoSegundos = 0;
    if (colL_duracaoISO) {
      duracaoSegundos = parseDurationISO(colL_duracaoISO);
    }
    if (duracaoSegundos === 0 && colG_duracao) {
      duracaoSegundos = parseDurationText(colG_duracao);
    }
    if (duracaoSegundos === 0 && dataInicio && dataFim) {
      duracaoSegundos = Math.max(0, Math.floor((dataFim.getTime() - dataInicio.getTime()) / 1000));
    }

    // Status normalizado
    let statusNormalizado: 'RESOLVIDO' | 'INCIDENTE' = 'INCIDENTE';
    if (colD_status.includes('RESOLVIDO') || colD_status.includes('RESOLVED') || (dataFim && !colD_status.includes('INCIDENTE'))) {
      statusNormalizado = 'RESOLVIDO';
    }

    // Severidade normalizada
    let severidadeClean = colA_severidade;
    const sevLower = colA_severidade.toLowerCase();
    if (sevLower.includes('desastre') || sevLower.includes('disaster')) severidadeClean = 'Desastre';
    else if (sevLower.includes('alta') || sevLower.includes('high')) severidadeClean = 'Alta';
    else if (sevLower.includes('média') || sevLower.includes('media') || sevLower.includes('average')) severidadeClean = 'Média';
    else if (sevLower.includes('atenção') || sevLower.includes('atencao') || sevLower.includes('warning')) severidadeClean = 'Atenção';
    else if (sevLower.includes('informação') || sevLower.includes('informacao') || sevLower.includes('information')) severidadeClean = 'Informação';

    // Reconhecido normalizado
    let reconhecidoClean = 'Não';
    const recLower = colH_reconhecido.toLowerCase();
    if (recLower.includes('sim') || recLower.includes('yes') || recLower.includes('1') || recLower.includes('true')) {
      reconhecidoClean = 'Sim';
    }

    const etiquetas = parseTags(colJ_etiquetas);

    events.push({
      id: colM_eventId || `evt-${i + 1}-${Date.now().toString(36)}`,
      severidade: severidadeClean || 'Informação',
      hora: colB_hora,
      dataInicio,
      horaRecuperacao: colC_horaRecup,
      dataFim,
      status: statusNormalizado,
      host: colE_host || 'Host Desconhecido',
      incidente: finalIncidente || 'Incidente sem descrição',
      expressao: finalExpressao || undefined,
      duracaoTexto: colG_duracao || formatDuration(duracaoSegundos),
      duracaoSegundos,
      reconhecido: reconhecidoClean,
      acoes: colI_acoes,
      etiquetasTexto: colJ_etiquetas,
      etiquetas,
      horaRecuperacaoISO: colK_horaRecupISO,
      duracaoISO: colL_duracaoISO,
      eventId: colM_eventId || undefined,
      usuario: colN_usuario || undefined,
    });
  }

  if (events.length === 0) {
    throw new Error('Nenhum evento válido foi encontrado na planilha.');
  }

  return events;
}

/**
 * Lê arquivo File (.xlsx, .xls) do navegador e retorna lista de eventos Zabbix.
 */
export async function parseExcelFile(file: File): Promise<ZabbixEvent[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'xlsx' && extension !== 'xls') {
    throw new Error('Formato inválido. Por favor envie um arquivo com extensão .xlsx ou .xls.');
  }

  const buffer = await file.arrayBuffer();
  return parseZabbixWorkbook(buffer);
}

/**
 * Analisa uma expressão Zabbix e extrai metadados estruturais básicos.
 */
function extractExpressionMetadata(expression: string): {
  parsedItemKey?: string;
  parsedFunction?: string;
  parsedThreshold?: string;
} {
  if (!expression || typeof expression !== 'string') return {};

  let parsedFunction: string | undefined;
  const funcMatch = expression.match(/\b(last|avg|min|max|nodata|count|sum|change|diff|fuzzytime|find)\b/i);
  if (funcMatch) {
    parsedFunction = funcMatch[1].toLowerCase();
  }

  let parsedItemKey: string | undefined;
  // Procura padrão Zabbix 5.4+/6.x/7.x: /host/item.key[...] ou chave clássica item.key[...]
  const keyMatch = expression.match(/\/[^/]+\/([a-zA-Z0-9_.-]+(?:\[[^\]]*\])?)/) || expression.match(/([a-zA-Z0-9_.-]+\[[^\]]*\])/);
  if (keyMatch) {
    parsedItemKey = keyMatch[1];
  }

  let parsedThreshold: string | undefined;
  // Procura threshold de comparação (ex: <>0, =0, >90, #3)
  const threshMatch = expression.match(/(<>|<=|>=|=|<|>)\s*(\d+(?:\.\d+)?)/);
  const sampleMatch = expression.match(/#\d+/);
  if (threshMatch && sampleMatch) {
    parsedThreshold = `${sampleMatch[0]} ${threshMatch[0]}`;
  } else if (threshMatch) {
    parsedThreshold = threshMatch[0];
  } else if (sampleMatch) {
    parsedThreshold = sampleMatch[0];
  }

  return { parsedItemKey, parsedFunction, parsedThreshold };
}

/**
 * Lê e analisa a pasta de trabalho contendo o catálogo de triggers e expressões (Host, Nome, Expressão).
 */
export function parseTriggerCatalogWorkbook(buffer: ArrayBuffer): ZabbixTriggerCatalogItem[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('O arquivo de triggers não contém planilhas válidas.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error('A planilha selecionada está vazia.');
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (!rawRows || rawRows.length < 2) {
    throw new Error('A planilha de triggers precisa conter pelo menos o cabeçalho e uma linha de dados.');
  }

  // Localiza a linha do cabeçalho
  let headerRowIndex = -1;
  let colHostIndex = -1;
  let colNameIndex = -1;
  let colExprIndex = -1;

  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    const rowStrings = row.map((cell) => String(cell || '').trim().toLowerCase());

    const hIdx = rowStrings.findIndex((c) =>
      c === 'host' || c === 'servidor' || c === 'hostname' || c === 'equipamento' || c === 'nome do host'
    );
    const nIdx = rowStrings.findIndex((c) =>
      c === 'nome' || c === 'name' || c === 'trigger' || c === 'gatilho' || c === 'incidente' || c === 'problema' || c === 'nome da trigger'
    );
    const eIdx = rowStrings.findIndex((c) =>
      c === 'expressão' || c === 'expressao' || c === 'expression' || c === 'fórmula' || c === 'formula' || c === 'condição' || c === 'condicao'
    );

    if (hIdx !== -1 && (nIdx !== -1 || eIdx !== -1)) {
      headerRowIndex = r;
      colHostIndex = hIdx;
      colNameIndex = nIdx !== -1 ? nIdx : 1;
      colExprIndex = eIdx !== -1 ? eIdx : 2;
      break;
    }
  }

  // Fallback se não encontrou cabeçalho com nomes exatos: assume colunas 0, 1, 2
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    colHostIndex = 0;
    colNameIndex = 1;
    colExprIndex = 2;
  }

  const items: ZabbixTriggerCatalogItem[] = [];

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || !Array.isArray(row)) continue;

    const host = String(row[colHostIndex] || '').trim();
    const name = String(row[colNameIndex] || '').trim();
    const expression = String(row[colExprIndex] || '').trim();

    // Pula linhas vazias
    if (!host && !name && !expression) continue;
    // Pula se for cabeçalho duplicado
    if (host.toLowerCase() === 'host' && (name.toLowerCase() === 'nome' || expression.toLowerCase() === 'expressão')) continue;

    const { parsedItemKey, parsedFunction, parsedThreshold } = extractExpressionMetadata(expression);

    items.push({
      id: `trg-${i}-${Date.now().toString(36)}`,
      host: host || 'Host Global',
      name: name || 'Trigger sem nome',
      expression: expression || 'Sem expressão informada',
      parsedItemKey,
      parsedFunction,
      parsedThreshold,
    });
  }

  if (items.length === 0) {
    throw new Error('Nenhum trigger válido foi encontrado na planilha. Verifique se as colunas Host, Nome e Expressão estão presentes.');
  }

  return items;
}

/**
 * Lê arquivo File (.xlsx, .xls, .csv) de catálogo de triggers e retorna lista de itens.
 */
export async function parseTriggerCatalogFile(file: File): Promise<ZabbixTriggerCatalogItem[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
    throw new Error('Formato inválido. Por favor envie um arquivo com extensão .xlsx, .xls ou .csv.');
  }

  const buffer = await file.arrayBuffer();
  return parseTriggerCatalogWorkbook(buffer);
}

