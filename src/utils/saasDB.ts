/**
 * SaaS Database Layer (localStorage + IndexedDB)
 * Implements zabbixAnalyzerDB (schema v1) for multi-tenant, white-label, client management, and report history.
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { ClientTriggerCatalog, ReportBrandingConfig } from '../types/zabbix';

export interface SaaSUser {
  id: string;
  email: string;
  passwordHash: string; // SHA-256 hex
  name: string;
  role: 'admin' | 'analyst';
  createdAt: string;
}

export interface SaaSSession {
  userId: string;
  token: string;
  expiresAt: string;
}

export interface SaaSCompany {
  id: string;
  name: string;
  logoDataUrl?: string;
  primaryColor: string;
  accentColor: string;
  technicalResponsible: string; // Texto livre rigoroso: NUNCA adicionar prefixos/sufixos como "Especialista"
  address?: string;
  document?: string;
  defaultBranding?: ReportBrandingConfig;
  globalTriggerCatalog?: ClientTriggerCatalog;
}

export interface SaaSClient {
  id: string;
  companyId: string;
  name: string;
  logoDataUrl?: string;
  contactName?: string;
  contactEmail?: string;
  createdAt: string;
  triggerCatalog?: ClientTriggerCatalog;
  branding?: ReportBrandingConfig;
}

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPromptExtra: string;
}

export interface SaaSReport {
  id: string;
  companyId: string;
  clientId?: string;
  clientName: string;
  createdAt: string;
  periodStart?: string;
  periodEnd?: string;
  fileName: string;
  kpis: {
    totalEvents: number;
    shortDurationPct: number;
    ackRatePct: number;
    mttrSec: number;
    mtbfSec: number;
    topHost: string;
  };
  narrative?: {
    markdown: string;
    html?: string;
  };
  pdfStored: boolean;
  reportTheme?: 'tecnico' | 'executivo' | 'book_resultados';
  documentCode?: string;
  revision?: string;
  elaborator?: string;
  approver?: string;
  operationalNotes?: string[];
  dataSnapshot?: {
    totalEvents: number;
    hostCount: number;
    triggerCount: number;
    dateRange: string;
  };
  tuningTriggersSample?: {
    name: string;
    host: string;
    count: number;
    expression?: string;
    proposedOptimization?: string;
  }[];
}

export interface SaaSPreferences {
  theme: 'dark' | 'light';
  visibleCharts: string[];
  timelineBucket: '15min' | '1h' | '1d';
}

export interface SaaSDB {
  version: number;
  users: SaaSUser[];
  session: SaaSSession | null;
  companies: SaaSCompany[];
  clients: SaaSClient[];
  deepseekConfig: DeepSeekConfig;
  reports: SaaSReport[];
  preferences: SaaSPreferences;
}

const STORAGE_KEY = 'zabbixAnalyzerDB';

// SHA-256 hash de senha via Web Crypto nativo
export async function hashPassword(plainText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Gera UUID v4 seguro
export function generateUUID(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Inicializa ou carrega o banco SaaS
export async function initializeSaaSDB(): Promise<SaaSDB> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SaaSDB;
      if (parsed.version === 1 && parsed.users && parsed.companies) {
        return parsed;
      }
    } catch {
      // Falha ao parsear, reinicia com seed
    }
  }

  // Seed inicial: admin@local / admin123
  const adminPasswordHash = await hashPassword('admin123');
  const defaultCompanyId = generateUUID();
  const defaultAdminId = generateUUID();

  const initialDB: SaaSDB = {
    version: 1,
    users: [
      {
        id: defaultAdminId,
        email: 'admin@local',
        passwordHash: adminPasswordHash,
        name: 'Administrador Petros',
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
    ],
    session: {
      userId: defaultAdminId,
      token: generateUUID(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    companies: [
      {
        id: defaultCompanyId,
        name: 'Petros',
        logoDataUrl: '',
        primaryColor: '#0f172a',
        accentColor: '#3b82f6',
        technicalResponsible: 'Engenheiro Sênior de Observabilidade',
        address: 'Av. Rio Branco, 1 - Centro, Rio de Janeiro - RJ',
        document: '33.000.111/0001-22',
      },
    ],
    clients: [
      {
        id: generateUUID(),
        companyId: defaultCompanyId,
        name: 'PetroRio / Equinix Datacenter',
        contactName: 'Gerência de Infraestrutura',
        contactEmail: 'operacoes@petrorio.com.br',
        createdAt: new Date().toISOString(),
      },
      {
        id: generateUUID(),
        companyId: defaultCompanyId,
        name: 'Vale Mineração & Logística',
        contactName: 'NOC Corporativo',
        contactEmail: 'noc@vale.com',
        createdAt: new Date().toISOString(),
      },
    ],
    deepseekConfig: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      temperature: 0.3,
      maxTokens: 4096,
      systemPromptExtra:
        'Você é um Engenheiro Sênior de Observabilidade e Zabbix Certified Expert. Analise os incidentes com foco em tuning de triggers, eliminação de ruído operacional, expressões de histerese e hierarquia de dependências.',
    },
    reports: [],
    preferences: {
      theme: 'dark',
      visibleCharts: [
        'chart-timeline',
        'chart-severity',
        'chart-hosts',
        'chart-triggers',
        'chart-status',
        'chart-duration',
        'chart-hours',
        'chart-evolution',
      ],
      timelineBucket: '15min',
    },
  };

  saveSaaSDB(initialDB);
  return initialDB;
}

export function getSaaSDB(): SaaSDB {
  if (typeof localStorage === 'undefined') {
    return {
      version: 1,
      users: [],
      session: null,
      companies: [
        {
          id: 'default-co',
          name: 'Petros',
          primaryColor: '#0f172a',
          accentColor: '#3b82f6',
          technicalResponsible: 'Engenheiro Sênior de Observabilidade',
        },
      ],
      clients: [],
      deepseekConfig: {
        apiKey: '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        temperature: 0.3,
        maxTokens: 4096,
        systemPromptExtra: '',
      },
      reports: [],
      preferences: {
        theme: 'dark',
        visibleCharts: [],
        timelineBucket: '15min',
      },
    };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Retorna fallback básico síncrono
    return {
      version: 1,
      users: [],
      session: null,
      companies: [
        {
          id: 'default-co',
          name: 'Petros',
          primaryColor: '#0f172a',
          accentColor: '#3b82f6',
          technicalResponsible: 'Engenheiro Sênior de Observabilidade',
        },
      ],
      clients: [],
      deepseekConfig: {
        apiKey: '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        temperature: 0.3,
        maxTokens: 4096,
        systemPromptExtra: '',
      },
      reports: [],
      preferences: {
        theme: 'dark',
        visibleCharts: [],
        timelineBucket: '15min',
      },
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return getSaaSDB();
  }
}

export function saveSaaSDB(db: SaaSDB): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.error('Falha ao salvar SaaS DB no localStorage:', err);
  }
}

// Helpers de Sessão & Auth
export async function loginUser(email: string, passwordPlain: string): Promise<SaaSUser | null> {
  const db = getSaaSDB();
  const hash = await hashPassword(passwordPlain);
  const user = db.users.find(
    (u) => u.email.trim().toLowerCase() === email.trim().toLowerCase() && u.passwordHash === hash
  );

  if (!user) return null;

  db.session = {
    userId: user.id,
    token: generateUUID(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };
  saveSaaSDB(db);
  return user;
}

export async function signupUser(params: {
  name: string;
  email: string;
  passwordPlain: string;
  companyName: string;
}): Promise<SaaSUser> {
  const db = getSaaSDB();
  const exists = db.users.some(
    (u) => u.email.trim().toLowerCase() === params.email.trim().toLowerCase()
  );
  if (exists) {
    throw new Error('Já existe uma conta com este e-mail.');
  }

  const userId = generateUUID();
  const companyId = generateUUID();
  const passwordHash = await hashPassword(params.passwordPlain);

  const newUser: SaaSUser = {
    id: userId,
    email: params.email.trim().toLowerCase(),
    passwordHash,
    name: params.name.trim(),
    role: db.users.length === 0 ? 'admin' : 'analyst',
    createdAt: new Date().toISOString(),
  };

  const newCompany: SaaSCompany = {
    id: companyId,
    name: params.companyName.trim() || 'Minha Empresa',
    primaryColor: '#0f172a',
    accentColor: '#3b82f6',
    technicalResponsible: 'Engenheiro de Observabilidade',
  };

  db.users.push(newUser);
  db.companies.push(newCompany);
  db.session = {
    userId,
    token: generateUUID(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };

  saveSaaSDB(db);
  return newUser;
}

export function logoutUser(): void {
  const db = getSaaSDB();
  db.session = null;
  saveSaaSDB(db);
}

export function getCurrentUser(): SaaSUser | null {
  const db = getSaaSDB();
  if (!db.session) return null;
  const now = new Date();
  if (new Date(db.session.expiresAt) < now) {
    db.session = null;
    saveSaaSDB(db);
    return null;
  }
  return db.users.find((u) => u.id === db.session?.userId) || null;
}

export function getActiveCompany(): SaaSCompany {
  const db = getSaaSDB();
  return (
    db.companies[0] || {
      id: 'default-co',
      name: 'Petros',
      primaryColor: '#0f172a',
      accentColor: '#3b82f6',
      technicalResponsible: 'Engenheiro Sênior de Observabilidade',
    }
  );
}

export function updateCompany(companyData: Partial<SaaSCompany>): SaaSCompany {
  const db = getSaaSDB();
  if (db.companies.length === 0) {
    const newCo: SaaSCompany = {
      id: generateUUID(),
      name: companyData.name || 'Petros',
      primaryColor: companyData.primaryColor || '#0f172a',
      accentColor: companyData.accentColor || '#3b82f6',
      technicalResponsible: companyData.technicalResponsible || '',
      logoDataUrl: companyData.logoDataUrl,
      address: companyData.address,
      document: companyData.document,
    };
    db.companies.push(newCo);
    saveSaaSDB(db);
    return newCo;
  }
  db.companies[0] = { ...db.companies[0], ...companyData };
  saveSaaSDB(db);
  return db.companies[0];
}

// Clientes CRUD
export function getClients(): SaaSClient[] {
  const db = getSaaSDB();
  return db.clients || [];
}

export function saveClient(client: Omit<SaaSClient, 'id' | 'createdAt'> & { id?: string }): SaaSClient {
  const db = getSaaSDB();
  if (client.id) {
    const idx = db.clients.findIndex((c) => c.id === client.id);
    if (idx >= 0) {
      db.clients[idx] = {
        ...db.clients[idx],
        ...client,
      };
      saveSaaSDB(db);
      return db.clients[idx];
    }
  }

  const newClient: SaaSClient = {
    ...client,
    id: generateUUID(),
    createdAt: new Date().toISOString(),
  };
  db.clients.push(newClient);
  saveSaaSDB(db);
  return newClient;
}

export function deleteClient(id: string): void {
  const db = getSaaSDB();
  db.clients = db.clients.filter((c) => c.id !== id);
  saveSaaSDB(db);
}

// Catálogo de Triggers & Expressões do Cliente
export function saveClientTriggerCatalog(clientId: string, catalog: ClientTriggerCatalog): void {
  const db = getSaaSDB();
  const idx = db.clients.findIndex((c) => c.id === clientId);
  if (idx >= 0) {
    db.clients[idx].triggerCatalog = catalog;
    saveSaaSDB(db);
  }
}

export function getClientTriggerCatalog(clientId: string): ClientTriggerCatalog | null {
  const db = getSaaSDB();
  const client = db.clients.find((c) => c.id === clientId);
  return client?.triggerCatalog || null;
}

export function deleteClientTriggerCatalog(clientId: string): void {
  const db = getSaaSDB();
  const idx = db.clients.findIndex((c) => c.id === clientId);
  if (idx >= 0) {
    delete db.clients[idx].triggerCatalog;
    saveSaaSDB(db);
  }
}

// Catálogo Global de Triggers da Empresa
export function saveCompanyGlobalTriggerCatalog(catalog: ClientTriggerCatalog): void {
  const db = getSaaSDB();
  if (db.companies.length > 0) {
    db.companies[0].globalTriggerCatalog = catalog;
    saveSaaSDB(db);
  }
}

export function getCompanyGlobalTriggerCatalog(): ClientTriggerCatalog | null {
  const db = getSaaSDB();
  return db.companies[0]?.globalTriggerCatalog || null;
}

export function deleteCompanyGlobalTriggerCatalog(): void {
  const db = getSaaSDB();
  if (db.companies.length > 0) {
    delete db.companies[0].globalTriggerCatalog;
    saveSaaSDB(db);
  }
}

/**
 * Retorna o catálogo ativo considerando o cliente selecionado com fallback para o global da empresa.
 */
export function getActiveTriggerCatalog(clientId?: string): ClientTriggerCatalog | null {
  if (clientId) {
    const clientCat = getClientTriggerCatalog(clientId);
    if (clientCat && clientCat.items && clientCat.items.length > 0) {
      return clientCat;
    }
  }
  return getCompanyGlobalTriggerCatalog();
}


// Identidade Visual & Branding do Relatório por Cliente e Empresa
export function saveClientBranding(clientId: string, branding: ReportBrandingConfig): void {
  const db = getSaaSDB();
  const idx = db.clients.findIndex((c) => c.id === clientId);
  if (idx >= 0) {
    db.clients[idx].branding = {
      ...(db.clients[idx].branding || {}),
      ...branding,
    };
    saveSaaSDB(db);
  }
}

export function getClientBranding(clientId: string): ReportBrandingConfig | null {
  const db = getSaaSDB();
  const client = db.clients.find((c) => c.id === clientId);
  return client?.branding || null;
}

export function saveCompanyDefaultBranding(branding: ReportBrandingConfig): void {
  const db = getSaaSDB();
  if (db.companies.length > 0) {
    db.companies[0].defaultBranding = {
      ...(db.companies[0].defaultBranding || {}),
      ...branding,
    };
    saveSaaSDB(db);
  }
}

export function getMergedBranding(clientId?: string): ReportBrandingConfig {
  const db = getSaaSDB();
  const company = db.companies[0] || {
    id: 'default',
    name: 'Petros',
    primaryColor: '#0f172a',
    accentColor: '#3b82f6',
    technicalResponsible: 'Engenheiro Sênior de Observabilidade',
  };
  const client = clientId ? db.clients.find((c) => c.id === clientId) : undefined;
  const cb = client?.branding;
  const gb = company.defaultBranding;

  const todayStr = new Intl.DateTimeFormat('pt-BR').format(new Date());

  return {
    reportTitle: cb?.reportTitle !== undefined ? cb.reportTitle : (gb?.reportTitle !== undefined ? gb.reportTitle : (cb?.defaultReportTitle || '')),
    defaultReportTitle: cb?.defaultReportTitle || gb?.defaultReportTitle || '',
    documentCode: cb?.documentCode || gb?.documentCode || 'REL.SNOC.GAB_TELCO.001',
    docCodePrefix: cb?.docCodePrefix || gb?.docCodePrefix || 'REL.SNOC',
    revision: cb?.revision || gb?.revision || '0',
    publicationDate: cb?.publicationDate || gb?.publicationDate || todayStr,
    revisionDate: cb?.revisionDate || gb?.revisionDate || todayStr,
    elaborator: cb?.elaborator || gb?.elaborator || 'Equipe de Observabilidade',
    approver: cb?.approver || gb?.approver || company.technicalResponsible || 'Gerência de NOC',
    operationalModel: 'NOC | Network Operations Center',
    departmentTags: ['NOC | Network Operations Center'],
    selectedDepartmentTag: 'NOC | Network Operations Center',
    objectiveDescription:
      cb?.objectiveDescription ||
      gb?.objectiveDescription ||
      'Avaliação de ruído operacional, tempo de vida de incidentes e tuning cirúrgico de triggers Zabbix 7.0.',
    coverSubtitle: cb?.coverSubtitle || gb?.coverSubtitle || 'C.D.C.I | SNOC – Monitoramento',
    logoDataUrl: cb?.logoDataUrl || client?.logoDataUrl || gb?.logoDataUrl || company.logoDataUrl || '',
    coverImageDataUrl: cb?.coverImageDataUrl || gb?.coverImageDataUrl || '',
    accentColor: cb?.accentColor || gb?.accentColor || company.accentColor || '#38bdf8',
    headerStyle: cb?.headerStyle || gb?.headerStyle || 'modelo_estruturado',
    includeCover: cb?.includeCover !== undefined ? cb.includeCover : (gb?.includeCover !== undefined ? gb.includeCover : true),
    coverStyle: cb?.coverStyle || gb?.coverStyle || 'padrao_oficial',
    operationalContextNotes: cb?.operationalContextNotes || gb?.operationalContextNotes || [],
  };
}


// DeepSeek Config
export function getDeepSeekConfig(): DeepSeekConfig {
  const db = getSaaSDB();
  return (
    db.deepseekConfig || {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      temperature: 0.3,
      maxTokens: 4096,
      systemPromptExtra: '',
    }
  );
}

export function updateDeepSeekConfig(cfg: Partial<DeepSeekConfig>): DeepSeekConfig {
  const db = getSaaSDB();
  db.deepseekConfig = { ...getDeepSeekConfig(), ...cfg };
  saveSaaSDB(db);
  return db.deepseekConfig;
}

// Relatórios & Armazenamento de PDF em IndexedDB
export async function saveGeneratedReport(
  reportData: Omit<SaaSReport, 'id' | 'createdAt'>,
  pdfBlob?: Blob
): Promise<SaaSReport> {
  const db = getSaaSDB();
  const id = generateUUID();
  const newReport: SaaSReport = {
    ...reportData,
    id,
    createdAt: new Date().toISOString(),
    pdfStored: !!pdfBlob,
  };

  if (pdfBlob) {
    try {
      await idbSet(`zabbix_report_pdf_${id}`, pdfBlob);
    } catch (err) {
      console.warn('Erro ao salvar PDF no IndexedDB:', err);
      newReport.pdfStored = false;
    }
  }

  db.reports.unshift(newReport);
  saveSaaSDB(db);
  return newReport;
}

export function getReportsList(): SaaSReport[] {
  const db = getSaaSDB();
  return db.reports || [];
}

export async function getReportPDFBlob(reportId: string): Promise<Blob | null> {
  try {
    const blob = await idbGet<Blob>(`zabbix_report_pdf_${reportId}`);
    return blob || null;
  } catch (err) {
    console.error('Erro ao ler PDF do IndexedDB:', err);
    return null;
  }
}

export async function deleteReport(reportId: string): Promise<void> {
  const db = getSaaSDB();
  db.reports = db.reports.filter((r) => r.id !== reportId);
  saveSaaSDB(db);
  try {
    await idbDel(`zabbix_report_pdf_${reportId}`);
  } catch {
    // Silencioso
  }
}
