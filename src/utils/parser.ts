import * as XLSX from 'xlsx';
import { ZabbixEvent } from '../types/zabbix';

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
 * Processa a planilha Excel (ArrayBuffer) e normaliza os eventos conforme as 12 colunas do Zabbix.
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

  // Detecta a linha de cabeçalho procurando por "Severidade" na primeira coluna
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 25); i++) {
    const row = rawRows[i];
    if (Array.isArray(row) && row.length > 0) {
      const colA = String(row[0] || '').trim().toLowerCase();
      if (colA.includes('severidade') || colA.includes('severity')) {
        headerRowIndex = i;
        break;
      }
    }
  }

  // Se não encontrou "Severidade" explicitamente, valida se a primeira linha parece cabeçalho
  if (headerRowIndex === -1) {
    const firstRowStr = (rawRows[0] || []).map((c) => String(c).toLowerCase()).join(' ');
    if (firstRowStr.includes('host') || firstRowStr.includes('status') || firstRowStr.includes('incidente')) {
      headerRowIndex = 0;
    } else {
      throw new Error(
        'Cabeçalho Zabbix não detectado. O relatório deve conter a coluna "Severidade" na coluna A.'
      );
    }
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

    const colA_severidade = String(row[0] || '').trim();
    const colB_hora = String(row[1] || '').trim();
    const colC_horaRecup = String(row[2] || '').trim();
    const colD_status = String(row[3] || '').trim().toUpperCase();
    const colE_host = String(row[4] || '').trim();
    const colF_incidente = String(row[5] || '').trim();
    const colG_duracao = String(row[6] || '').trim();
    const colH_reconhecido = String(row[7] || '').trim();
    const colI_acoes = String(row[8] || '').trim();
    const colJ_etiquetas = String(row[9] || '').trim();
    const colK_horaRecupISO = String(row[10] || '').trim();
    const colL_duracaoISO = String(row[11] || '').trim();

    // Se nem host nem severidade existem, pula linha
    if (!colA_severidade && !colE_host && !colF_incidente) {
      continue;
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
      id: `evt-${i + 1}-${Date.now().toString(36)}`,
      severidade: severidadeClean || 'Informação',
      hora: colB_hora,
      dataInicio,
      horaRecuperacao: colC_horaRecup,
      dataFim,
      status: statusNormalizado,
      host: colE_host || 'Host Desconhecido',
      incidente: colF_incidente || 'Incidente sem descrição',
      duracaoTexto: colG_duracao || formatDuration(duracaoSegundos),
      duracaoSegundos,
      reconhecido: reconhecidoClean,
      acoes: colI_acoes,
      etiquetasTexto: colJ_etiquetas,
      etiquetas,
      horaRecuperacaoISO: colK_horaRecupISO,
      duracaoISO: colL_duracaoISO,
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
