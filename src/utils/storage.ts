import { ZabbixEvent, SavedSession } from '../types/zabbix';

const STORAGE_ACTIVE_KEY = 'zabbix_active_report';
const STORAGE_SESSIONS_KEY = 'zabbix_saved_sessions';

/**
 * Revitaliza objetos Date após desserialização JSON
 */
function reviveEvents(events: ZabbixEvent[]): ZabbixEvent[] {
  return events.map((e: any) => ({
    ...e,
    host: typeof e.host === 'object' && e.host !== null ? (e.host.host || String(e.host)) : String(e.host || 'Host Desconhecido'),
    incidente: typeof e.incidente === 'object' && e.incidente !== null ? (e.incidente.trigger || e.incidente.name || String(e.incidente)) : String(e.incidente || 'Incidente sem descrição'),
    dataInicio: e.dataInicio ? new Date(e.dataInicio) : null,
    dataFim: e.dataFim ? new Date(e.dataFim) : null,
  }));
}

/**
 * Salva automaticamente o relatório ativo no localStorage
 */
export function saveActiveReport(filename: string, events: ZabbixEvent[]): void {
  try {
    const payload = {
      filename,
      timestamp: Date.now(),
      events,
    };
    localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Não foi possível persistir relatório ativo no localStorage (limite de cota):', err);
  }
}

/**
 * Carrega o relatório ativo salvo no localStorage
 */
export function loadActiveReport(): { filename: string; events: ZabbixEvent[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.events) && parsed.events.length > 0) {
      return {
        filename: parsed.filename || 'Relatório Salvo',
        events: reviveEvents(parsed.events),
      };
    }
  } catch (err) {
    console.warn('Erro ao ler relatório ativo:', err);
  }
  return null;
}

/**
 * Remove o relatório ativo salvo
 */
export function clearActiveReport(): void {
  try {
    localStorage.removeItem(STORAGE_ACTIVE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Retorna todas as sessões salvas no histórico
 */
export function getSavedSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS_KEY);
    if (!raw) return [];
    const list: SavedSession[] = JSON.parse(raw);
    return list.map((s) => ({
      ...s,
      events: reviveEvents(s.events),
    }));
  } catch {
    return [];
  }
}

/**
 * Adiciona ou atualiza uma sessão no histórico de relatórios
 */
export function saveSessionToHistory(name: string, events: ZabbixEvent[]): SavedSession {
  const sessions = getSavedSessions();
  const newSession: SavedSession = {
    id: `session-${Date.now()}`,
    name,
    timestamp: Date.now(),
    eventCount: events.length,
    events,
  };

  // Mantém os últimos 8 relatórios para economizar espaço de quota
  const updated = [newSession, ...sessions.filter((s) => s.name !== name)].slice(0, 8);

  try {
    localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Falha ao salvar sessão no histórico:', err);
  }

  return newSession;
}

/**
 * Deleta uma sessão do histórico
 */
export function deleteSessionFromHistory(id: string): SavedSession[] {
  const sessions = getSavedSessions();
  const updated = sessions.filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore
  }
  return updated;
}
