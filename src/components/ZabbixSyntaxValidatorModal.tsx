import React, { useState, useMemo } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Copy,
  CheckCheck,
  Code2,
  Cpu,
  Layers,
  ArrowRight,
  Sparkles,
  Info,
  HelpCircle,
  Play,
  RotateCcw,
} from 'lucide-react';

interface ZabbixSyntaxValidatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProblemExpression?: string;
  initialRecoveryExpression?: string;
  triggerName?: string;
  hostName?: string;
}

interface ValidationResult {
  isValid: boolean;
  score: number; // 0 to 100
  checks: {
    id: string;
    label: string;
    status: 'pass' | 'warning' | 'fail';
    detail: string;
  }[];
  parsedParts: {
    functions: string[];
    hosts: string[];
    keys: string[];
    hasHysteresis: boolean;
    isModernSyntax: boolean;
  };
  recommendations: string[];
}

const ZABBIX_SUPPORTED_FUNCTIONS = [
  'last',
  'avg',
  'min',
  'max',
  'sum',
  'count',
  'nodata',
  'diff',
  'change',
  'trendavg',
  'trendmin',
  'trendmax',
  'trendsum',
  'trendcount',
  'rate',
  'fuzzytime',
  'find',
  'time',
  'date',
  'dayofmonth',
  'dayofweek',
];

export const ZabbixSyntaxValidatorModal: React.FC<ZabbixSyntaxValidatorModalProps> = ({
  isOpen,
  onClose,
  initialProblemExpression = '',
  initialRecoveryExpression = '',
  triggerName = '',
  hostName = '',
}) => {
  const [problemExpr, setProblemExpr] = useState(initialProblemExpression);
  const [recoveryExpr, setRecoveryExpr] = useState(initialRecoveryExpression);
  const [copiedField, setCopiedField] = useState<'problem' | 'recovery' | 'both' | null>(null);

  // Sincroniza props iniciais quando abre
  React.useEffect(() => {
    if (isOpen) {
      setProblemExpr(initialProblemExpression);
      setRecoveryExpr(initialRecoveryExpression);
    }
  }, [isOpen, initialProblemExpression, initialRecoveryExpression]);

  // Validador sintático e semântico Zabbix 6/7
  const validation: ValidationResult = useMemo(() => {
    const checks: ValidationResult['checks'] = [];
    const recommendations: string[] = [];
    const pTrim = problemExpr.trim();
    const rTrim = recoveryExpr.trim();

    if (!pTrim) {
      return {
        isValid: false,
        score: 0,
        checks: [
          {
            id: 'empty',
            label: 'Expressão de Problema Preenchida',
            status: 'fail',
            detail: 'Insira uma expressão Zabbix para iniciar a validação.',
          },
        ],
        parsedParts: {
          functions: [],
          hosts: [],
          keys: [],
          hasHysteresis: false,
          isModernSyntax: false,
        },
        recommendations: ['Cole ou selecione um preset de expressão Zabbix acima.'],
      };
    }

    // 1. Checagem de parênteses
    let openParen = 0;
    let balanced = true;
    for (let i = 0; i < pTrim.length; i++) {
      if (pTrim[i] === '(') openParen++;
      else if (pTrim[i] === ')') {
        openParen--;
        if (openParen < 0) {
          balanced = false;
          break;
        }
      }
    }
    if (openParen !== 0) balanced = false;

    if (balanced) {
      checks.push({
        id: 'parens',
        label: 'Parênteses Balanceados',
        status: 'pass',
        detail: 'Todos os parênteses de funções e blocos lógicos foram fechados corretamente.',
      });
    } else {
      checks.push({
        id: 'parens',
        label: 'Parênteses Balanceados',
        status: 'fail',
        detail: 'Existe parêntese aberto sem fechamento correspondente na expressão.',
      });
      recommendations.push('Verifique o fechamento de parênteses em todas as funções Zabbix.');
    }

    // 2. Detecção de Sintaxe Moderna Zabbix 5.4/6.x/7.0 vs Legado
    const isModern = pTrim.includes('/host/') || /\/[a-zA-Z0-9_\-.]+\/[a-zA-Z0-9_\-.[\]"*,]+/.test(pTrim);
    const isLegacy = /\{[a-zA-Z0-9_\-.:]+\.[a-zA-Z0-9_]+\(/.test(pTrim);

    if (isModern) {
      checks.push({
        id: 'syntax_version',
        label: 'Padrão Sintático Moderno (Zabbix 6.x / 7.0)',
        status: 'pass',
        detail: 'Utiliza a notação padronizada function(/host/key, [params]) do Zabbix moderno.',
      });
    } else if (isLegacy) {
      checks.push({
        id: 'syntax_version',
        label: 'Padrão Sintático Legado {HOST:item.func()}',
        status: 'warning',
        detail: 'A expressão está na notação Zabbix 5.0 ou anterior. O Zabbix 7.0 prefere func(/host/key).',
      });
      recommendations.push('Recomendado migrar para a sintaxe Zabbix 6/7: func(/host/key, params).');
    } else {
      checks.push({
        id: 'syntax_version',
        label: 'Estrutura da Item Key',
        status: 'warning',
        detail: 'Não foi identificada claramente a barra de separação /host/key na expressão.',
      });
    }

    // 3. Extração e validação de funções Zabbix
    const foundFunctions: string[] = [];
    const funcRegex = /([a-zA-Z0-9_]+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(pTrim)) !== null) {
      const fn = match[1].toLowerCase();
      if (!['and', 'or', 'not'].includes(fn)) {
        foundFunctions.push(fn);
      }
    }

    const unsupported = foundFunctions.filter((f) => !ZABBIX_SUPPORTED_FUNCTIONS.includes(f));
    if (foundFunctions.length > 0 && unsupported.length === 0) {
      checks.push({
        id: 'functions',
        label: `Funções Oficiais Validadas (${foundFunctions.join(', ')})`,
        status: 'pass',
        detail: `Todas as funções detectadas são homologadas na documentação oficial Zabbix 7.0.`,
      });
    } else if (unsupported.length > 0) {
      checks.push({
        id: 'functions',
        label: 'Funções Não Reconhecidas',
        status: 'fail',
        detail: `Função(ões) desconhecida(s) encontrada(s): ${unsupported.join(', ')}.`,
      });
      recommendations.push(`Substitua funções inválidas por funções homologadas (${ZABBIX_SUPPORTED_FUNCTIONS.slice(0, 8).join(', ')}...).`);
    } else {
      checks.push({
        id: 'functions',
        label: 'Nenhuma Função Detectada',
        status: 'fail',
        detail: 'A expressão precisa conter pelo menos uma função Zabbix válida (ex: last, avg, nodata).',
      });
    }

    // 4. Checagem de Operadores Lógicos e Comparadores
    const hasComparison = /[<>=!]=?/.test(pTrim);
    if (hasComparison) {
      checks.push({
        id: 'operators',
        label: 'Operadores de Comparação e Limiar',
        status: 'pass',
        detail: 'Limiar numérico ou condição booleana definida com operadores válidos.',
      });
    } else {
      checks.push({
        id: 'operators',
        label: 'Operador de Comparação Ausente',
        status: 'warning',
        detail: 'A expressão não possui operadores relacionais (>, <, =, >=, <=). O Zabbix avaliará como booleano puro.',
      });
    }

    // 5. Análise de Histerese / Proteção contra Flapping
    const usesPureLast = /last\([^)]*#1?\)/.test(pTrim) || (/last\(/.test(pTrim) && !pTrim.includes('#') && !pTrim.includes('m') && !pTrim.includes('s'));
    const hasHysteresis = !!rTrim;

    if (hasHysteresis) {
      checks.push({
        id: 'hysteresis',
        label: 'Expressão de Recuperação Ativa (Anti-Flapping)',
        status: 'pass',
        detail: 'Existe expressão de recuperação dedicada, garantindo histerese operacional e evitando oscilação de alarmes.',
      });
    } else if (usesPureLast) {
      checks.push({
        id: 'hysteresis',
        label: 'Risco Elevado de Flapping (last pontual sem histerese)',
        status: 'warning',
        detail: 'A trigger usa last() pontual sem janela temporal ou expressão de recuperação. Flutuações instantâneas reabrirão o incidente repetidamente.',
      });
      recommendations.push('Adicione uma Expressão de Recuperação ou use min(..., 5m) / last(..., #3) para mitigar flapping.');
    } else {
      checks.push({
        id: 'hysteresis',
        label: 'Mitigação Temporal na Expressão',
        status: 'pass',
        detail: 'A expressão de problema emprega agregação temporal ou contagem consecutiva de amostras.',
      });
    }

    // Cálculo do score
    let score = 100;
    checks.forEach((c) => {
      if (c.status === 'fail') score -= 35;
      else if (c.status === 'warning') score -= 15;
    });
    score = Math.max(0, Math.min(100, score));

    return {
      isValid: checks.every((c) => c.status !== 'fail'),
      score,
      checks,
      parsedParts: {
        functions: foundFunctions,
        hosts: [],
        keys: [],
        hasHysteresis,
        isModernSyntax: isModern,
      },
      recommendations,
    };
  }, [problemExpr, recoveryExpr]);

  const handleCopy = (field: 'problem' | 'recovery' | 'both') => {
    let textToCopy = '';
    if (field === 'problem') textToCopy = problemExpr;
    else if (field === 'recovery') textToCopy = recoveryExpr;
    else textToCopy = `// PROBLEMA:\n${problemExpr}\n\n// RECUPERAÇÃO:\n${recoveryExpr}`;

    navigator.clipboard.writeText(textToCopy);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const applyPreset = (preset: { p: string; r: string }) => {
    setProblemExpr(preset.p);
    setRecoveryExpr(preset.r);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 my-6 max-h-[92vh] flex flex-col">
        {/* Header do Modal */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Validador de Sintaxe Zabbix 7.0 &amp; Auditoria de Histerese
                </h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Padrão SNOC
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Valide parênteses, funções oficiais e proteção antirruído antes da aplicação em produção.
                {triggerName && (
                  <span className="block text-slate-700 dark:text-slate-300 font-mono text-[11px] mt-0.5">
                    Trigger alvo: <strong>{triggerName}</strong> {hostName ? `(${hostName})` : ''}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets Rápidos */}
        <div className="pt-3 pb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Presets Oficiais:
          </span>
          <button
            type="button"
            onClick={() =>
              applyPreset({
                p: 'min(/SRV-PROD-01/system.cpu.util, 5m) > 90',
                r: 'max(/SRV-PROD-01/system.cpu.util, 10m) < 70',
              })
            }
            className="text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            CPU com Histerese (90% / 70%)
          </button>
          <button
            type="button"
            onClick={() =>
              applyPreset({
                p: 'nodata(/ROUTER-CORE/icmpping, 3m) = 1',
                r: 'nodata(/ROUTER-CORE/icmpping, 3m) = 0',
              })
            }
            className="text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            nodata() Queda de Link
          </button>
          <button
            type="button"
            onClick={() =>
              applyPreset({
                p: 'last(/SRV-DB/vfs.fs.size[/,pfree]) < 10 and time() > 080000',
                r: 'last(/SRV-DB/vfs.fs.size[/,pfree]) > 15',
              })
            }
            className="text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            Disco &lt; 10% com Recovery
          </button>
          <button
            type="button"
            onClick={() =>
              applyPreset({
                p: 'count(/SW-DIST/net.if.status[eth0], 10m, "ne", 1) > 3',
                r: 'count(/SW-DIST/net.if.status[eth0], 15m, "ne", 1) = 0',
              })
            }
            className="text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            Interface Flapping count()
          </button>
        </div>

        {/* Corpo com Grid de Inputs e Painel de Diagnóstico */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* Seção de Entrada das Expressões */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Expressão de Problema */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span>Expressão de Problema (Problem Expression)</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleCopy('problem')}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  title="Copiar Expressão de Problema"
                >
                  {copiedField === 'problem' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedField === 'problem' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <textarea
                value={problemExpr}
                onChange={(e) => setProblemExpr(e.target.value)}
                placeholder="Ex: min(/host/system.cpu.util, 5m) > 90"
                rows={3}
                className="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
              <span className="text-[10px] text-slate-400">
                Expressão disparada quando a anomalia atinge o limiar operacional.
              </span>
            </div>

            {/* Expressão de Recuperação */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Expressão de Recuperação (Recovery Expression)</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleCopy('recovery')}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  title="Copiar Expressão de Recuperação"
                >
                  {copiedField === 'recovery' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedField === 'recovery' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <textarea
                value={recoveryExpr}
                onChange={(e) => setRecoveryExpr(e.target.value)}
                placeholder="Ex: max(/host/system.cpu.util, 10m) < 70"
                rows={3}
                className="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-400">
                Garante que o alarme só fecha quando o recurso atinge faixa segura estável.
              </span>
            </div>
          </div>

          {/* Painel de Conformidade e Score */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Checklist de Validação Zabbix 7.0
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    validation.isValid
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                  }`}
                >
                  {validation.isValid ? 'Sintaxe Homologada' : 'Ajustes Necessários'}
                </span>
              </div>

              {/* Indicador de Score */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Índice de Confiabilidade:</span>
                <span
                  className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${
                    validation.score >= 85
                      ? 'bg-emerald-600 text-white'
                      : validation.score >= 60
                      ? 'bg-amber-600 text-white'
                      : 'bg-red-600 text-white'
                  }`}
                >
                  {validation.score}%
                </span>
              </div>
            </div>

            {/* Lista de Checagens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {validation.checks.map((c) => (
                <div
                  key={c.id}
                  className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                    c.status === 'pass'
                      ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-900/60 text-slate-800 dark:text-slate-200'
                      : c.status === 'warning'
                      ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
                      : 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200'
                  }`}
                >
                  {c.status === 'pass' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  {c.status === 'warning' && (
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  )}
                  {c.status === 'fail' && (
                    <X className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold block">{c.label}</span>
                    <span className="text-[11px] opacity-80 leading-relaxed block mt-0.5">
                      {c.detail}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recomendações de Engenharia Zabbix */}
            {validation.recommendations.length > 0 && (
              <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-950 dark:text-blue-200 text-xs">
                <span className="font-bold flex items-center gap-1.5 mb-1 text-blue-800 dark:text-blue-300">
                  <Info className="w-4 h-4" /> Diretrizes de Engenharia de Observabilidade:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {validation.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setProblemExpr('');
                setRecoveryExpr('');
              }}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Limpar Campos
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy('both')}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer flex items-center gap-1.5 border border-slate-300 dark:border-slate-700"
            >
              {copiedField === 'both' ? (
                <CheckCheck className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>{copiedField === 'both' ? 'Pacote Copiado!' : 'Copiar Problema + Recuperação'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
            >
              Concluir &amp; Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
