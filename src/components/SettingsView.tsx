/**
 * Tela de Configurações do SaaS Zabbix Analyzer
 * Gerenciamento de Empresa Emissora (White-label), API DeepSeek, Conta e Backup.
 */

import React, { useState } from 'react';
import {
  getActiveCompany,
  updateCompany,
  getDeepSeekConfig,
  updateDeepSeekConfig,
  getCurrentUser,
  getSaaSDB,
  saveSaaSDB,
  hashPassword,
  SaaSCompany,
  DeepSeekConfig,
} from '../utils/saasDB';
import { testDeepSeekConnection } from '../utils/deepseek';
import {
  Settings,
  Building2,
  Cpu,
  User,
  Database,
  Palette,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Upload,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Download,
} from 'lucide-react';

interface SettingsViewProps {
  onBackToApp: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBackToApp,
  theme,
  onToggleTheme,
}) => {
  const [activeTab, setActiveTab] = useState<'company' | 'deepseek' | 'appearance' | 'account' | 'database'>('company');

  // Estado Empresa
  const [company, setCompany] = useState<SaaSCompany>(() => getActiveCompany());
  const [companyFeedback, setCompanyFeedback] = useState<string | null>(null);

  // Estado DeepSeek
  const [deepseek, setDeepseek] = useState<DeepSeekConfig>(() => getDeepSeekConfig());
  const [showApiKey, setShowApiKey] = useState(false);
  const [deepseekFeedback, setDeepseekFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);

  // Estado Conta
  const currentUser = getCurrentUser();
  const [userName, setUserName] = useState(currentUser?.name || '');
  const [userEmail, setUserEmail] = useState(currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountFeedback, setAccountFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Feedback Geral
  const [dbFeedback, setDbFeedback] = useState<string | null>(null);

  // Salvar Empresa
  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = updateCompany(company);
    setCompany(updated);
    setCompanyFeedback('Dados da empresa emissora atualizados com sucesso!');
    setTimeout(() => setCompanyFeedback(null), 3500);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCompany((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // Salvar DeepSeek
  const handleSaveDeepSeek = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = updateDeepSeekConfig(deepseek);
    setDeepseek(updated);
    setDeepseekFeedback({ success: true, message: 'Configurações de IA salvas com sucesso.' });
    setTimeout(() => setDeepseekFeedback(null), 4000);
  };

  // Testar Conexão DeepSeek
  const handleTestDeepSeek = async () => {
    setIsTestingApi(true);
    setDeepseekFeedback(null);
    try {
      const res = await testDeepSeekConnection(deepseek.apiKey, deepseek.baseUrl, deepseek.model);
      setDeepseekFeedback(res);
    } catch (err: any) {
      setDeepseekFeedback({ success: false, message: `Falha: ${err.message}` });
    } finally {
      setIsTestingApi(false);
    }
  };

  // Salvar Conta & Senha
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFeedback(null);
    if (!currentUser) return;

    const db = getSaaSDB();
    const userIdx = db.users.findIndex((u) => u.id === currentUser.id);
    if (userIdx === -1) return;

    if (newPassword.trim().length > 0) {
      if (!currentPassword) {
        setAccountFeedback({ success: false, message: 'Informe a senha atual para alterá-la.' });
        return;
      }
      const curHash = await hashPassword(currentPassword);
      if (curHash !== db.users[userIdx].passwordHash) {
        setAccountFeedback({ success: false, message: 'Senha atual incorreta.' });
        return;
      }
      db.users[userIdx].passwordHash = await hashPassword(newPassword);
    }

    db.users[userIdx].name = userName.trim();
    db.users[userIdx].email = userEmail.trim().toLowerCase();
    saveSaaSDB(db);

    setCurrentPassword('');
    setNewPassword('');
    setAccountFeedback({ success: true, message: 'Dados da conta atualizados com sucesso.' });
    setTimeout(() => setAccountFeedback(null), 3500);
  };

  // Exportar Backup
  const handleExportDB = () => {
    const db = getSaaSDB();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `zabbix_analyzer_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setDbFeedback('Backup exportado com sucesso.');
    setTimeout(() => setDbFeedback(null), 3000);
  };

  // Importar Backup
  const handleImportDB = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed.version && parsed.users) {
          saveSaaSDB(parsed);
          setCompany(getActiveCompany());
          setDeepseek(getDeepSeekConfig());
          setDbFeedback('Banco restaurado com sucesso! Recarregando...');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          alert('Arquivo JSON inválido para Zabbix Analyzer DB.');
        }
      } catch (err: any) {
        alert('Erro ao processar arquivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Reset de Fábrica
  const handleResetFactory = () => {
    if (confirm('Atenção: Isso irá resetar todos os dados locais para o padrão de fábrica (admin@local / admin123). Deseja continuar?')) {
      localStorage.removeItem('zabbixAnalyzerDB');
      localStorage.removeItem('zabbix_saved_sessions');
      localStorage.removeItem('zabbix_active_report');
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Barra superior */}
        <div className="flex items-center justify-between mb-6">
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
                <Settings className="w-6 h-6 text-slate-700 dark:text-slate-300" />
                <span>Configurações da Plataforma</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Personalize o white-label, credenciais DeepSeek AI, preferências visuais e segurança.
              </p>
            </div>
          </div>
        </div>

        {/* Layout de Abas */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto text-xs font-semibold">
            <button
              onClick={() => setActiveTab('company')}
              className={`flex items-center gap-2 px-5 py-3.5 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'company'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Empresa Emissora (White-label)</span>
            </button>

            <button
              onClick={() => setActiveTab('deepseek')}
              className={`flex items-center gap-2 px-5 py-3.5 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'deepseek'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Inteligência Artificial (DeepSeek)</span>
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center gap-2 px-5 py-3.5 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'appearance'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50/30 dark:bg-purple-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>Aparência &amp; Tema</span>
            </button>

            <button
              onClick={() => setActiveTab('account')}
              className={`flex items-center gap-2 px-5 py-3.5 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'account'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Conta &amp; Segurança</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-2 px-5 py-3.5 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'database'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Dados &amp; Backup</span>
            </button>
          </div>

          <div className="p-6">
            {/* ABA: EMPRESA EMISSORA (WHITE-LABEL) */}
            {activeTab === 'company' && (
              <form onSubmit={handleSaveCompany} className="max-w-2xl space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    Identidade Visual da Empresa Emissora
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Estes dados configuram o cabeçalho e rodapé do Relatório Técnico PDF e a barra de navegação.
                  </p>
                </div>

                {companyFeedback && (
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>{companyFeedback}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nome da Empresa Emissora *
                    </label>
                    <input
                      type="text"
                      required
                      value={company.name}
                      onChange={(e) => setCompany({ ...company, name: e.target.value })}
                      placeholder="Ex: Petros"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Substituído dinamicamente na tag: <code>NOC &#123;Empresa Emissora&#125; / OBSERVABILIDADE</code>
                    </span>
                  </div>

                  <div>
                    {/* REGRA DO CARGO RIGOROSA */}
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Responsável Técnico (Nome e/ou Cargo exato)
                    </label>
                    <input
                      type="text"
                      value={company.technicalResponsible || ''}
                      onChange={(e) => setCompany({ ...company, technicalResponsible: e.target.value })}
                      placeholder="Ex: Engenheiro Sênior de Observabilidade"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Impresso exatamente como digitado no PDF (sem adicionar termos como "Especialista"). Se vazio, exibe "—".
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Cor Primária (Hex)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={company.primaryColor || '#0f172a'}
                        onChange={(e) => setCompany({ ...company, primaryColor: e.target.value })}
                        className="w-10 h-8 p-0 border border-slate-300 dark:border-slate-700 rounded-md cursor-pointer"
                      />
                      <input
                        type="text"
                        value={company.primaryColor || '#0f172a'}
                        onChange={(e) => setCompany({ ...company, primaryColor: e.target.value })}
                        className="w-28 px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Cor de Destaque / Acento (Hex)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={company.accentColor || '#3b82f6'}
                        onChange={(e) => setCompany({ ...company, accentColor: e.target.value })}
                        className="w-10 h-8 p-0 border border-slate-300 dark:border-slate-700 rounded-md cursor-pointer"
                      />
                      <input
                        type="text"
                        value={company.accentColor || '#3b82f6'}
                        onChange={(e) => setCompany({ ...company, accentColor: e.target.value })}
                        className="w-28 px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Logo da Empresa Emissora
                  </label>
                  <div className="flex items-center gap-4">
                    {company.logoDataUrl ? (
                      <div className="relative w-16 h-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1">
                        <img src={company.logoDataUrl} alt="Logo" className="w-full h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setCompany({ ...company, logoDataUrl: '' })}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
                        <Upload className="w-6 h-6" />
                      </div>
                    )}
                    <label className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
                      <span>Carregar Logo</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Salvar Empresa Emissora
                  </button>
                </div>
              </form>
            )}

            {/* ABA: DEEPSEEK CONFIG */}
            {activeTab === 'deepseek' && (
              <form onSubmit={handleSaveDeepSeek} className="max-w-2xl space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span>Configuração da API DeepSeek</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Conecte a chave da DeepSeek para diagnósticos em tempo real com raciocínio de tuning Zabbix.
                  </p>
                </div>

                {deepseekFeedback && (
                  <div
                    className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                      deepseekFeedback.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {deepseekFeedback.success ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span>{deepseekFeedback.message}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Chave de API DeepSeek (sk-...)
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={deepseek.apiKey}
                      onChange={(e) => setDeepseek({ ...deepseek, apiKey: e.target.value })}
                      placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full pl-3 pr-10 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    A chave fica salva exclusivamente no seu navegador (localStorage).
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Endpoint Base URL
                    </label>
                    <input
                      type="text"
                      value={deepseek.baseUrl}
                      onChange={(e) => setDeepseek({ ...deepseek, baseUrl: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Modelo
                    </label>
                    <select
                      value={deepseek.model}
                      onChange={(e) => setDeepseek({ ...deepseek, model: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="deepseek-chat">deepseek-chat (V3 - Rápido &amp; Eficiente)</option>
                      <option value="deepseek-reasoner">deepseek-reasoner (R1 - Raciocínio Profundo)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Temperatura: {deepseek.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={deepseek.temperature}
                      onChange={(e) => setDeepseek({ ...deepseek, temperature: parseFloat(e.target.value) })}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <span className="text-[10px] text-slate-400">Recomendado: 0.2 a 0.4 para precisão técnica.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min="500"
                      max="8192"
                      value={deepseek.maxTokens}
                      onChange={(e) => setDeepseek({ ...deepseek, maxTokens: parseInt(e.target.value, 10) || 4096 })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Instrução Extra do Sistema (System Prompt)
                  </label>
                  <textarea
                    rows={3}
                    value={deepseek.systemPromptExtra}
                    onChange={(e) => setDeepseek({ ...deepseek, systemPromptExtra: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Salvar Configurações
                  </button>

                  <button
                    type="button"
                    onClick={handleTestDeepSeek}
                    disabled={isTestingApi || !deepseek.apiKey}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 disabled:opacity-50 cursor-pointer"
                  >
                    {isTestingApi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
                    <span>Testar Conexão</span>
                  </button>
                </div>
              </form>
            )}

            {/* ABA: APARÊNCIA */}
            {activeTab === 'appearance' && (
              <div className="max-w-xl space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    Preferências de Interface &amp; Tema
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ajuste o esquema de cores para operação diurna ou ambientes de NOC escuros.
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Modo Escuro (Dark Mode)</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ideal para telões de NOC e redução do cansaço visual.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer"
                  >
                    {theme === 'dark' ? 'Mudar para Claro' : 'Mudar para Escuro'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA: CONTA */}
            {activeTab === 'account' && (
              <form onSubmit={handleSaveAccount} className="max-w-xl space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    Minha Conta de Usuário
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Edite seus dados de acesso e senha (armazenamento criptografado via SHA-256 nativo).
                  </p>
                </div>

                {accountFeedback && (
                  <div
                    className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                      accountFeedback.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {accountFeedback.success ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span>{accountFeedback.message}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Alterar Senha</h4>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Senha Atual
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nova Senha (deixe em branco se não desejar alterar)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Salvar Alterações de Conta
                  </button>
                </div>
              </form>
            )}

            {/* ABA: DADOS & BACKUP */}
            {activeTab === 'database' && (
              <div className="max-w-xl space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    Gerenciamento &amp; Backup da Base Local
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Exporte ou restaure suas empresas, clientes e configurações.
                  </p>
                </div>

                {dbFeedback && (
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>{dbFeedback}</span>
                  </div>
                )}

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Exportar Backup Completo</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Gera um arquivo JSON contendo empresas, clientes cadastrados, configurações e histórico de relatórios.
                  </p>
                  <button
                    type="button"
                    onClick={handleExportDB}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Arquivo JSON de Backup</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Restaurar de Backup</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Selecione um arquivo de backup previamente exportado para restabelecer os dados.
                  </p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
                    <Upload className="w-4 h-4" />
                    <span>Selecionar Backup JSON</span>
                    <input type="file" accept=".json" className="hidden" onChange={handleImportDB} />
                  </label>
                </div>

                <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 space-y-3">
                  <h4 className="text-xs font-bold text-red-800 dark:text-red-300">Restaurar Padrões de Fábrica</h4>
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    Apaga todas as configurações, empresas e relatórios locais, restaurando o usuário admin inicial.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetFactory}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Restaurar Padrões de Fábrica
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
