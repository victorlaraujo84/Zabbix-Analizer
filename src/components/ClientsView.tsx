/**
 * Gerenciamento de Clientes (Empresas Contratantes)
 * Permite cadastrar, editar, excluir clientes e fazer upload de logos.
 */

import React, { useState, useRef } from 'react';
import {
  SaaSClient,
  getClients,
  saveClient,
  deleteClient,
  getActiveCompany,
  saveClientTriggerCatalog,
  deleteClientTriggerCatalog,
  getReportsList,
} from '../utils/saasDB';
import { ClientTriggerCatalog } from '../types/zabbix';
import { parseTriggerCatalogFile } from '../utils/parser';
import {
  Building2,
  Plus,
  Trash2,
  Edit2,
  Mail,
  User,
  Search,
  Upload,
  Check,
  X,
  ArrowLeft,
  FileSpreadsheet,
  Code2,
  Copy,
  CheckCheck,
  Loader2,
  Eye,
  FileText,
} from 'lucide-react';

interface ClientsViewProps {
  onBackToApp: () => void;
  onSelectClientForAnalysis?: (client: SaaSClient) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ onBackToApp, onSelectClientForAnalysis }) => {
  const [clients, setClients] = useState<SaaSClient[]>(() => getClients());
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<SaaSClient | null>(null);
  const [clientToDelete, setClientToDelete] = useState<SaaSClient | null>(null);

  // Contagem de relatórios emitidos por cliente para governança
  const reportsCountByClient = React.useMemo(() => {
    const list = getReportsList();
    const counts: Record<string, number> = {};
    for (const r of list) {
      counts[r.clientName] = (counts[r.clientName] || 0) + 1;
    }
    return counts;
  }, []);

  // Formulário
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Estados de Configuração de Relatório & Capa por Cliente
  const [hasCustomBranding, setHasCustomBranding] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [coverSubtitle, setCoverSubtitle] = useState('C.D.C.I | SNOC – Monitoramento');
  const [documentCode, setDocumentCode] = useState('REL.SNOC.GAB_TELCO.001');
  const [revision, setRevision] = useState('0');
  const [elaborator, setElaborator] = useState('Equipe de Observabilidade');
  const [approver, setApprover] = useState('Gerência de NOC');
  const [selectedDepartmentTag, setSelectedDepartmentTag] = useState('NOC | Network Operations Center');
  const [headerStyle, setHeaderStyle] = useState<'modelo_estruturado' | 'executivo_moderno'>('modelo_estruturado');
  const [coverStyle, setCoverStyle] = useState<'padrao_oficial' | 'institucional_gradient' | 'minimalista_tecnica'>('padrao_oficial');
  const [includeCover, setIncludeCover] = useState(true);
  const [coverImageDataUrl, setCoverImageDataUrl] = useState('');
  const [operationalNotesText, setOperationalNotesText] = useState('');

  const activeCompany = getActiveCompany();

  const handleOpenAdd = () => {
    setEditingClient(null);
    setName('');
    setContactName('');
    setContactEmail('');
    setLogoDataUrl('');
    setHasCustomBranding(false);
    setReportTitle('');
    setCoverSubtitle('C.D.C.I | SNOC – Monitoramento');
    setDocumentCode('REL.SNOC.GAB_TELCO.001');
    setRevision('0');
    setElaborator('Equipe de Observabilidade');
    setApprover(activeCompany.technicalResponsible || 'Gerência de NOC');
    setSelectedDepartmentTag('NOC | Network Operations Center');
    setHeaderStyle('modelo_estruturado');
    setCoverStyle('padrao_oficial');
    setIncludeCover(true);
    setCoverImageDataUrl('');
    setOperationalNotesText('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (client: SaaSClient) => {
    setEditingClient(client);
    setName(client.name);
    setContactName(client.contactName || '');
    setContactEmail(client.contactEmail || '');
    setLogoDataUrl(client.logoDataUrl || '');

    const b = client.branding;
    setHasCustomBranding(!!b);
    setReportTitle(b?.reportTitle || b?.defaultReportTitle || '');
    setCoverSubtitle(b?.coverSubtitle || 'C.D.C.I | SNOC – Monitoramento');
    setDocumentCode(b?.documentCode || 'REL.SNOC.GAB_TELCO.001');
    setRevision(b?.revision || '0');
    setElaborator(b?.elaborator || 'Equipe de Observabilidade');
    setApprover(b?.approver || activeCompany.technicalResponsible || 'Gerência de NOC');
    setSelectedDepartmentTag('NOC | Network Operations Center');
    setHeaderStyle((b?.headerStyle as any) === 'pop_tecnico' ? 'modelo_estruturado' : (b?.headerStyle as any) || 'modelo_estruturado');
    setCoverStyle((b?.coverStyle as any) === 'pop_oficial' ? 'padrao_oficial' : (b?.coverStyle as any) || 'padrao_oficial');
    setIncludeCover(b?.includeCover !== undefined ? b.includeCover : true);
    setCoverImageDataUrl(b?.coverImageDataUrl || '');
    setOperationalNotesText(b?.operationalContextNotes ? b.operationalContextNotes.join('\n') : '');
    setIsModalOpen(true);
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCoverImageDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const opNotes = operationalNotesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    saveClient({
      id: editingClient ? editingClient.id : undefined,
      companyId: activeCompany.id,
      name: name.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      logoDataUrl,
      branding: hasCustomBranding
        ? {
            reportTitle: reportTitle.trim(),
            defaultReportTitle: reportTitle.trim(),
            coverSubtitle: coverSubtitle.trim(),
            documentCode: documentCode.trim(),
            revision: revision.trim(),
            elaborator: elaborator.trim(),
            approver: approver.trim(),
            operationalModel: 'NOC | Network Operations Center',
            selectedDepartmentTag: 'NOC | Network Operations Center',
            headerStyle,
            coverStyle,
            includeCover,
            logoDataUrl,
            coverImageDataUrl,
            operationalContextNotes: opNotes,
          }
        : undefined,
    });

    setClients(getClients());
    setIsModalOpen(false);
    setFeedback(`Cliente "${name.trim()}" salvo com sucesso.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleConfirmDelete = () => {
    if (!clientToDelete) return;
    const deletedName = clientToDelete.name;
    deleteClient(clientToDelete.id);
    setClients(getClients());
    setClientToDelete(null);
    setFeedback(`Cliente "${deletedName}" foi excluído com sucesso.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Catálogo de Triggers & Expressões
  const [viewingCatalogClient, setViewingCatalogClient] = useState<SaaSClient | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [copiedExprId, setCopiedExprId] = useState<string | null>(null);
  const [uploadingClientId, setUploadingClientId] = useState<string | null>(null);
  const catalogFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleCatalogUpload = async (client: SaaSClient, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingClientId(client.id);
    try {
      const items = await parseTriggerCatalogFile(file);
      const catalog: ClientTriggerCatalog = {
        clientId: client.id,
        updatedAt: new Date().toISOString(),
        fileName: file.name,
        totalTriggers: items.length,
        items,
      };

      saveClientTriggerCatalog(client.id, catalog);
      const updatedClients = getClients();
      setClients(updatedClients);
      if (viewingCatalogClient && viewingCatalogClient.id === client.id) {
        setViewingCatalogClient(updatedClients.find((c) => c.id === client.id) || null);
      }
      setFeedback(`Catálogo com ${items.length} triggers carregado com sucesso para "${client.name}".`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao processar planilha de triggers.');
    } finally {
      setUploadingClientId(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleDeleteCatalog = (client: SaaSClient) => {
    deleteClientTriggerCatalog(client.id);
    const updatedClients = getClients();
    setClients(updatedClients);
    if (viewingCatalogClient && viewingCatalogClient.id === client.id) {
      setViewingCatalogClient(null);
    }
    setFeedback(`Catálogo de triggers de "${client.name}" removido.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleCopyExpression = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedExprId(id);
    setTimeout(() => setCopiedExprId(null), 2000);
  };


  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.contactName && c.contactName.toLowerCase().includes(search.toLowerCase())) ||
      (c.contactEmail && c.contactEmail.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Barra superior de navegação */}
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
                <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <span>Cadastro de Clientes (Contratantes)</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Gerencie empresas e contratos para emissão de diagnósticos e relatórios técnicos Zabbix.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Cliente</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Barra de Pesquisa */}
        <div className="mb-6 relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, contato ou e-mail..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Grid de Clientes */}
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhum cliente encontrado</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Cadastre suas empresas parceiras para associar incidentes, metas de MTTR/MTBF e emitir relatórios com logo do cliente.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((client) => (
              <div
                key={client.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-blue-500/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      {client.logoDataUrl ? (
                        <img
                          src={client.logoDataUrl}
                          alt={client.name}
                          className="w-10 h-10 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm border border-blue-200 dark:border-blue-800">
                          {client.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                          {client.name}
                        </h3>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Cadastrado em {new Date(client.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(client)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setClientToDelete(client)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Excluir Cliente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 py-2 border-t border-slate-100 dark:border-slate-800/80">
                    {client.contactName && (
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{client.contactName}</span>
                      </div>
                    )}
                    {client.contactEmail && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-[11px]">{client.contactEmail}</span>
                      </div>
                    )}
                  </div>

                  {/* Seção Catálogo de Triggers & Expressões */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Catálogo de Triggers & Expressões</span>
                      </span>
                    </div>

                    {client.triggerCatalog ? (
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2.5 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]">
                            <Check className="w-3 h-3" />
                            {client.triggerCatalog.totalTriggers} triggers carregados
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]" title={client.triggerCatalog.fileName}>
                            {client.triggerCatalog.fileName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingCatalogClient(client);
                              setCatalogSearch('');
                            }}
                            className="flex-1 py-1 px-2 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded cursor-pointer transition-colors flex items-center justify-center gap-1"
                          >
                            <Eye className="w-3 h-3 text-blue-500" />
                            Ver Expressões
                          </button>
                          <button
                            type="button"
                            onClick={() => catalogFileInputRefs.current[client.id]?.click()}
                            className="py-1 px-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded cursor-pointer transition-colors"
                            title="Substituir planilha de triggers"
                          >
                            <Upload className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCatalog(client)}
                            className="py-1 px-2 text-[11px] font-medium text-slate-400 hover:text-red-500 rounded cursor-pointer transition-colors"
                            title="Remover catálogo de triggers"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2.5 border border-dashed border-slate-200 dark:border-slate-700 text-center">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                          Nenhuma planilha vinculada (Host, Nome, Expressão).
                        </p>
                        <button
                          type="button"
                          disabled={uploadingClientId === client.id}
                          onClick={() => catalogFileInputRefs.current[client.id]?.click()}
                          className="w-full py-1 px-2 rounded bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-[11px] font-bold border border-blue-200 dark:border-blue-800 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {uploadingClientId === client.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Processando...
                            </>
                          ) : (
                            <>
                              <Upload className="w-3 h-3" />
                              Importar Triggers (.xlsx)
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Input invisível para upload de planilha por cliente */}
                    <input
                      type="file"
                      ref={(el) => {
                        catalogFileInputRefs.current[client.id] = el;
                      }}
                      onChange={(e) => handleCatalogUpload(client, e)}
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                    />
                  </div>

                  {/* Resumo de Governança & Laudos Emitidos */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                      <FileText className="w-3.5 h-3.5 text-amber-500" />
                      <span>Laudos Emitidos:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {reportsCountByClient[client.name] || 0}
                      </span>
                      {reportsCountByClient[client.name] > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = '#/reports';
                          }}
                          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          Ver Histórico
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {onSelectClientForAnalysis && (
                  <button
                    onClick={() => onSelectClientForAnalysis(client)}
                    className="mt-4 w-full py-1.5 px-3 text-xs font-semibold text-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Filtrar Dashboard por este Cliente
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal de Adicionar / Editar */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                {editingClient ? 'Editar Cliente' : 'Novo Cliente Contratante'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                Os relatórios gerados incluirão o nome e a marca desta empresa.
              </p>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Empresa / Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: PetroRio / Equinix Datacenter"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Pessoa de Contato / Área
                    </label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Ex: Gerência de NOC"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      E-mail de Contato
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="Ex: noc@cliente.com"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Logo do Cliente (PNG/JPG/SVG)
                  </label>
                  <div className="flex items-center gap-3">
                    {logoDataUrl ? (
                      <div className="relative w-14 h-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1">
                        <img src={logoDataUrl} alt="Logo" className="w-full h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setLogoDataUrl('')}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
                        <Upload className="w-5 h-5" />
                      </div>
                    )}
                    <label className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
                      <span>Selecionar Imagem</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>
                  </div>
                </div>

                {/* Seção de Identidade Visual, Capa & Configurações de Relatório por Cliente */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Configurações de Relatório &amp; Capa do Cliente
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Defina o título padrão, modelo de capa, prefixo e notas operacionais para este cliente.
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasCustomBranding}
                        onChange={(e) => setHasCustomBranding(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {hasCustomBranding && (
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3 animate-in fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Título Padrão do Relatório (Editável)
                          </label>
                          <input
                            type="text"
                            value={reportTitle}
                            onChange={(e) => setReportTitle(e.target.value)}
                            placeholder="Ex: Laudo Técnico de Triggers, Relatório Mensal NOC..."
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Código / ID do Documento
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Subtítulo da Capa
                          </label>
                          <input
                            type="text"
                            value={coverSubtitle}
                            onChange={(e) => setCoverSubtitle(e.target.value)}
                            placeholder="Ex: C.D.C.I | SNOC – Monitoramento"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Estilo Visual da Capa Padrão
                          </label>
                          <select
                            value={coverStyle}
                            onChange={(e) => setCoverStyle(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          >
                            <option value="padrao_oficial">📋 Modelo Padrão Oficial (Tabela Estruturada)</option>
                            <option value="institucional_gradient">📘 Gradiente Corporativo SNOC (Fundo Escuro Tech)</option>
                            <option value="minimalista_tecnica">📄 Minimalista Técnico (Moldura Sutil)</option>
                          </select>
                        </div>
                      </div>

                      {/* Upload de Imagem de Capa do Cliente */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Imagem de Destaque da Capa do Cliente (Opcional)
                        </label>
                        <div className="flex items-center gap-3">
                          {coverImageDataUrl ? (
                            <div className="relative w-20 h-12 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100">
                              <img src={coverImageDataUrl} alt="Capa" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setCoverImageDataUrl('')}
                                className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]"
                              >
                                &times;
                              </button>
                            </div>
                          ) : (
                            <div className="w-20 h-12 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 text-[10px]">
                              Sem imagem
                            </div>
                          )}
                          <label className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                            <span>Alterar Imagem de Capa</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleCoverUpload}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Modelo Padrão de Cabeçalho Interno
                          </label>
                          <select
                            value={headerStyle}
                            onChange={(e) => setHeaderStyle(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          >
                            <option value="modelo_estruturado">📋 Modelo Técnico Estruturado (Grade Formal Oficial)</option>
                            <option value="executivo_moderno">👔 Executivo Moderno (Layout Limpo com Logo e Badge)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Modelo Operacional Institucional
                          </label>
                          <input
                            type="text"
                            disabled
                            value="NOC | Network Operations Center"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-not-allowed font-semibold"
                          />
                        </div>
                      </div>

                      {/* Particularidades Operacionais do Cliente */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Notas &amp; Particularidades Operacionais Recorrentes do Cliente
                        </label>
                        <textarea
                          rows={2}
                          value={operationalNotesText}
                          onChange={(e) => setOperationalNotesText(e.target.value)}
                          placeholder="Ex: Servidores SRV-ORACLE-01 e SRV-APP-02 desligam aos finais de semana para economia de energia. Janela diária de manutenção das 00:00 às 04:00."
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Estas informações serão carregadas automaticamente no relatório e informadas à IA.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
                  >
                    Salvar Cliente
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Exclusão de Cliente */}
        {clientToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Excluir Cliente
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Esta ação removerá o cadastro da organização.
                  </p>
                </div>
              </div>

              <div className="my-4 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  {clientToDelete.logoDataUrl ? (
                    <img
                      src={clientToDelete.logoDataUrl}
                      alt={clientToDelete.name}
                      className="w-10 h-10 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">
                      {clientToDelete.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="truncate">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {clientToDelete.name}
                    </p>
                    {clientToDelete.contactEmail && (
                      <p className="text-xs text-slate-500 font-mono truncate">
                        {clientToDelete.contactEmail}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
                Tem certeza que deseja excluir o cliente <strong>"{clientToDelete.name}"</strong>? O histórico de relatórios anteriores permanecerá armazenado, mas novos relatórios e seletores não exibirão mais este cliente.
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setClientToDelete(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-lg shadow-xs cursor-pointer transition-all"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Visualização de Catálogo de Triggers & Expressões */}
        {viewingCatalogClient && viewingCatalogClient.triggerCatalog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="relative w-full max-w-4xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
              {/* Header do Modal */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Catálogo de Triggers & Expressões</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold">
                        {viewingCatalogClient.name}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Arquivo: <span className="font-mono text-slate-700 dark:text-slate-300">{viewingCatalogClient.triggerCatalog.fileName}</span> ({viewingCatalogClient.triggerCatalog.totalTriggers} triggers cadastrados)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingCatalogClient(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filtro de Busca */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Buscar por host, nome do trigger ou parte da expressão Zabbix..."
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {
                    viewingCatalogClient.triggerCatalog.items.filter((item) => {
                      const q = catalogSearch.toLowerCase();
                      return (
                        item.host.toLowerCase().includes(q) ||
                        item.name.toLowerCase().includes(q) ||
                        item.expression.toLowerCase().includes(q)
                      );
                    }).length
                  }{' '}
                  de {viewingCatalogClient.triggerCatalog.totalTriggers}
                </span>
              </div>

              {/* Lista com Rolagem */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {viewingCatalogClient.triggerCatalog.items
                  .filter((item) => {
                    const q = catalogSearch.toLowerCase();
                    return (
                      !q ||
                      item.host.toLowerCase().includes(q) ||
                      item.name.toLowerCase().includes(q) ||
                      item.expression.toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 150)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-blue-500/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {item.host}
                          </span>
                          <span className="font-semibold text-xs text-slate-900 dark:text-white">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {item.parsedFunction && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                              fn: {item.parsedFunction}
                            </span>
                          )}
                          {item.parsedThreshold && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              {item.parsedThreshold}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bloco de Expressão com Copiar */}
                      <div className="relative group mt-2">
                        <pre className="p-2.5 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all border border-slate-800 leading-relaxed">
                          {item.expression}
                        </pre>
                        <button
                          type="button"
                          onClick={() => handleCopyExpression(item.id, item.expression)}
                          className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white opacity-80 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-1 text-[10px]"
                          title="Copiar expressão"
                        >
                          {copiedExprId === item.id ? (
                            <>
                              <CheckCheck className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copiado</span>
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
                  ))}
              </div>

              {/* Rodapé do Modal */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  As expressões salvas são correlacionadas automaticamente com os incidentes nos diagnósticos e relatórios.
                </span>
                <button
                  type="button"
                  onClick={() => setViewingCatalogClient(null)}
                  className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
