import React from 'react';
import { SavedSession } from '../types/zabbix';
import { formatDateTimeBR } from '../utils/parser';
import { X, FolderArchive, Trash2, Check, ArrowRight } from 'lucide-react';

interface SessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  activeSessionName: string | null;
  onSelectSession: (session: SavedSession) => void;
  onDeleteSession: (id: string) => void;
  onClearAll: () => void;
}

export const SessionsModal: React.FC<SessionsModalProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessionName,
  onSelectSession,
  onDeleteSession,
  onClearAll,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Relatórios Salvos no Navegador
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Os dados são armazenados localmente e ficam disponíveis mesmo após fechar a aba
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
            Nenhum relatório salvo no histórico ainda. Faça upload de um arquivo para persistir automaticamente.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto mb-5">
            {sessions.map((s) => {
              const isActive = s.name === activeSessionName;
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-colors ${
                    isActive
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60'
                  }`}
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {s.name}
                      </span>
                      {isActive && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-600 text-white uppercase">
                          Ativo
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <span className="font-mono tabular-nums">{s.eventCount} eventos</span>
                      <span>·</span>
                      <span>{formatDateTimeBR(new Date(s.timestamp))}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => {
                          onSelectSession(s);
                          onClose();
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <span>Carregar</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteSession(s.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                      title="Excluir do histórico"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
          <button
            onClick={onClearAll}
            className="text-red-600 dark:text-red-400 hover:underline cursor-pointer font-medium"
          >
            Limpar Todo o Histórico
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg font-semibold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
