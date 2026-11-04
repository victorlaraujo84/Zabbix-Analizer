import React, { useRef, useState, DragEvent } from 'react';
import { Upload, FileSpreadsheet, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { parseExcelFile } from '../utils/parser';
import { ZabbixEvent } from '../types/zabbix';

interface UploadZoneProps {
  onDataLoaded: (events: ZabbixEvent[], filename: string) => void;
  onLoadSample: () => void;
  isModal?: boolean;
  onCloseModal?: () => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onDataLoaded,
  onLoadSample,
  isModal = false,
  onCloseModal,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = async (file: File) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const events = await parseExcelFile(file);
      onDataLoaded(events, file.name);
      if (isModal && onCloseModal) {
        onCloseModal();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo Excel.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    // Reset para permitir re-seleção do mesmo arquivo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  return (
    <div className={`w-full ${isModal ? 'p-2' : 'max-w-3xl mx-auto py-12 px-4'}`}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-xs text-center transition-colors">
        <div className="w-14 h-14 mx-auto rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
          <FileSpreadsheet className="w-7 h-7" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          {isModal ? 'Carregar Novo Relatório Zabbix' : 'Análise de Relatórios Zabbix'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto mb-6">
          Faça o upload do arquivo exportado do Zabbix (<code className="font-mono text-xs text-slate-700 dark:text-slate-300">.xlsx</code> ou <code className="font-mono text-xs text-slate-700 dark:text-slate-300">.xls</code>). O processamento é 100% no seu navegador, sem envio de dados a nenhum servidor.
        </p>

        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 mb-6 cursor-pointer transition-all ${
            isDragging
              ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 scale-[0.99]'
              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls"
            className="hidden"
          />

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-4">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Processando planilha e mapeando até 15 colunas com Expressões Zabbix...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2">
              <Upload className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Arraste a planilha Zabbix aqui ou clique para selecionar
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto">
                Suporta planilhas de 12 a 15 colunas do Zabbix com mapeamento automático da coluna Expressão, Severidade, Host, Duração e Tags
              </p>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="flex items-start gap-3 p-4 mb-6 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-left">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-800 dark:text-red-200">
              <strong className="font-semibold block mb-0.5">Erro na validação do relatório:</strong>
              {errorMessage}
            </div>
          </div>
        )}

        {/* Botão de Demonstração com Dados de Exemplo */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-center gap-3">
          <span className="text-xs text-slate-400 dark:text-slate-500">Não tem um arquivo em mãos?</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLoadSample();
              if (isModal && onCloseModal) onCloseModal();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Carregar Dados de Exemplo (24 Incidentes)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
