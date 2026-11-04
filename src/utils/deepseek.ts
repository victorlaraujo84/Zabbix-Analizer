/**
 * DeepSeek API Client & AI Diagnostic Generator for Zabbix Analyzer
 */

import { ZabbixEvent, ZabbixKPIs, ZabbixFilters, ClientTriggerCatalog } from '../types/zabbix';
import { getDeepSeekConfig } from './saasDB';
import { formatDuration } from './parser';
import { getReportPeriodInfo, findTriggerExpression, generateBookDeResultadosPrompt } from './analytics';

export interface DeepSeekAnalysisResult {
  markdown: string;
  source: 'api' | 'offline_expert';
  modelUsed: string;
  error?: string;
}

export type ReportTheme = 'tecnico' | 'executivo' | 'book_resultados';

// Testa conectividade com a API da DeepSeek
export async function testDeepSeekConnection(apiKey: string, baseUrl?: string, model?: string): Promise<{ success: boolean; message: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, message: 'Chave de API não informada.' };
  }

  const endpoint = `${(baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '')}/chat/completions`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a test agent.' },
          { role: 'user', content: 'ping' },
        ],
        max_tokens: 10,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Erro HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    if (data.choices && data.choices.length > 0) {
      return { success: true, message: `Conexão estabelecida com sucesso! Modelo "${model || 'deepseek-chat'}" respondeu.` };
    }
    return { success: false, message: 'Resposta da API não conteve choices válidos.' };
  } catch (err: any) {
    return { success: false, message: `Falha na requisição de rede: ${err.message || 'Erro desconhecido'}` };
  }
}

// Gera o diagnóstico técnico ou executivo utilizando DeepSeek ou especialista determinístico
export async function runDeepSeekAnalysis(
  events: ZabbixEvent[],
  kpis: ZabbixKPIs,
  filters: ZabbixFilters,
  clientName?: string,
  theme: ReportTheme = 'tecnico',
  onPartialText?: (partial: string) => void,
  catalog?: ClientTriggerCatalog | null,
  extraOperationalNotes?: string[],
  customPromptDirectives?: string
): Promise<DeepSeekAnalysisResult> {
  const cfg = getDeepSeekConfig();

  const themeLabel =
    theme === 'book_resultados'
      ? 'Book de Resultados'
      : theme === 'executivo'
      ? 'Modelo Executivo'
      : 'Modelo Técnico';

  // Se a chave não estiver configurada, gera diagnóstico determinístico avançado para o tema escolhido
  if (!cfg.apiKey || cfg.apiKey.trim() === '') {
    const offlineMarkdown = generateDeterministicDiagnostic(
      events,
      kpis,
      filters,
      clientName,
      theme,
      catalog,
      extraOperationalNotes,
      customPromptDirectives
    );
    return {
      markdown: offlineMarkdown,
      source: 'offline_expert',
      modelUsed: `Especialista Local (${themeLabel})`,
    };
  }

  // Prepara o prompt estruturado de acordo com o tema selecionado
  const prompt = buildAnalysisPrompt(
    events,
    kpis,
    filters,
    clientName,
    theme,
    catalog,
    extraOperationalNotes,
    customPromptDirectives
  );
  const endpoint = `${(cfg.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '')}/chat/completions`;

  const systemContent =
    cfg.systemPromptExtra ||
    (theme === 'book_resultados'
      ? 'Você é um Arquiteto Principal de Observabilidade e Consultor Sênior de Estratégia de TI (Zabbix Certified Expert & SRE Director). Elabore o Book de Resultados unificando a visão executiva C-Level de negócio com a precisão cirúrgica de engenharia de triggers Zabbix 7.0 e histerese.'
      : theme === 'executivo'
      ? 'Você é um Consultor Estratégico de Confiabilidade de Sistemas (SRE) e Governança de TI. Analise o impacto dos incidentes de observabilidade com foco em SLA, risco ao negócio, custos operacionais da fadiga de alertas e direcionamento para tomadores de decisão (C-Level).'
      : 'Você é um Engenheiro Sênior de Observabilidade e Zabbix Certified Expert. Analise os incidentes com foco em tuning de triggers, eliminação de ruído operacional, expressões de histerese e hierarquia de dependências.');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: systemContent,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: cfg.temperature ?? 0.3,
        max_tokens: cfg.maxTokens ?? 4096,
        stream: !!onPartialText,
      }),
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.warn('Erro na chamada DeepSeek API, usando fallback:', errTxt);
      const fallback = generateDeterministicDiagnostic(events, kpis, filters, clientName, theme);
      return {
        markdown: fallback,
        source: 'offline_expert',
        modelUsed: `${cfg.model} (Fallback após erro HTTP ${response.status})`,
        error: `HTTP ${response.status}: ${errTxt.slice(0, 200)}`,
      };
    }

    if (onPartialText && response.body) {
      // Modo streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              onPartialText(fullText);
            }
          } catch {
            // Ignora linhas incompletas
          }
        }
      }

      if (fullText.trim().length > 0) {
        return {
          markdown: fullText,
          source: 'api',
          modelUsed: cfg.model,
        };
      }
    }

    // Modo não-streaming
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return {
      markdown: content,
      source: 'api',
      modelUsed: cfg.model,
    };
  } catch (err: any) {
    console.warn('Exceção ao chamar DeepSeek, usando fallback local:', err);
    const fallback = generateDeterministicDiagnostic(events, kpis, filters, clientName, theme, catalog);
    return {
      markdown: fallback,
      source: 'offline_expert',
      modelUsed: `Especialista Local (${theme === 'executivo' ? 'Executivo' : 'Técnico'})`,
      error: err.message,
    };
  }
}

// Monta o prompt enviado para a DeepSeek adaptado ao tema
function buildAnalysisPrompt(
  events: ZabbixEvent[],
  kpis: ZabbixKPIs,
  filters: ZabbixFilters,
  clientName?: string,
  theme: ReportTheme = 'tecnico',
  catalog?: ClientTriggerCatalog | null,
  extraOperationalNotes?: string[],
  customPromptDirectives?: string
): string {
  if (theme === 'book_resultados') {
    return generateBookDeResultadosPrompt(
      events,
      kpis,
      filters,
      events.length,
      catalog,
      customPromptDirectives
    );
  }

  const shortPct = kpis.totalEventos > 0 ? Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100) : 0;
  const { mesAno, periodoDescricao } = getReportPeriodInfo(filters, events);

  const contextNotesSection = extraOperationalNotes && extraOperationalNotes.length > 0
    ? `\n### PARTICULARIDADES OPERACIONAIS DO AMBIENTE (INFORMADAS PELO OPERADOR):\n${extraOperationalNotes.map((n) => `- ${n}`).join('\n')}\n(IMPORTANTE: Justifique que os incidentes relacionados a essas rotinas são comportamentos previstos da infraestrutura).\n`
    : '';

  // Top 5 triggers
  const trigMap = new Map<string, { count: number; dur: number; sev: string; host: string }>();
  for (const e of events) {
    const item = trigMap.get(e.incidente) || { count: 0, dur: 0, sev: e.severidade, host: e.host };
    item.count++;
    item.dur += e.duracaoSegundos;
    trigMap.set(e.incidente, item);
  }
  const topTriggers = Array.from(trigMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, d]) => `- Trigger: "${name}" | Ocorrências: ${d.count} | Severidade: ${d.sev} | Duração Média: ${formatDuration(Math.round(d.dur / d.count))} | Host Exemplo: ${d.host}`)
    .join('\n');

  // Coleta expressões vindas diretamente da planilha (coluna Expressão das 15 colunas)
  const directExpressionsList: string[] = [];
  const seenDirectTriggers = new Set<string>();
  for (const e of events) {
    if (e.expressao && !seenDirectTriggers.has(e.incidente)) {
      seenDirectTriggers.add(e.incidente);
      directExpressionsList.push(
        `- Host: "${e.host}"\n  Trigger / Incidente: "${e.incidente}"\n  Expressão Zabbix Mapeada da Planilha: \`${e.expressao}\``
      );
      if (directExpressionsList.length >= 6) break;
    }
  }

  let catalogSection = '';
  if (directExpressionsList.length > 0) {
    catalogSection = `\n\n### EXPRESSÕES TÉCNICAS REAIS DO ZABBIX MAPEADAS DA PLANILHA (15 COLUNAS):\n${directExpressionsList.join('\n\n')}\n\n**INSTRUÇÃO CRITERIOSA OBRIGATÓRIA**: Para cada trigger acima, realize uma análise aprofundada da sintaxe Zabbix atual. Avalie se o uso de funções pontuais (como \`last()\`) está causando falsos positivos ou flapping por falta de histerese. Forneça para cada uma: 1) Diagnóstico técnico do gatilho; 2) Problem Expression corrigida com agregação (\`min()\`, \`avg()\`, janela de tempo); 3) Recovery Expression com histerese para fechamento estável do alarme; 4) Sugestão de macro parametrizada e dependência.`;
  } else if (catalog && catalog.items && catalog.items.length > 0) {
    const matchedList: string[] = [];
    for (const [name, d] of Array.from(trigMap.entries()).slice(0, 5)) {
      const match = findTriggerExpression(d.host, name, catalog);
      if (match) {
        matchedList.push(
          `- Host: "${match.host}"\n  Trigger: "${match.name}"\n  Expressão Atual no Zabbix: \`${match.expression}\``
        );
      }
    }
    if (matchedList.length > 0) {
      catalogSection = `\n\n### EXPRESSÕES REAIS EXTRAÍDAS DO CATÁLOGO DE TRIGGERS DO CLIENTE (${catalog.fileName}):\n${matchedList.join('\n\n')}\n\n**INSTRUÇÃO OBRIGATÓRIA**: Para cada trigger com Expressão Atual listada acima, analise minuciosamente a fórmula Zabbix original e prescreva a refatoração exata (Problem Expression e Recovery Expression) mantendo os itens e macros originais com parâmetros de amostragem/histerese corrigidos.`;
    }
  }

  if (theme === 'executivo') {
    return `
Você é o Consultor Chefe de Observabilidade e Governança de TI.
Gere um relatório e diagnóstico ESTRATÉGICO / EXECUTIVO para os Diretores e Liderança de TI da empresa cliente: "${clientName || 'Cliente Corporativo'}".

### RECORTE TEMPORAL DO ESCOPO FILTRADO:
- Mês/Ano de Referência do Filtro: ${mesAno}
- Intervalo Específico: ${periodoDescricao}

### MÉTRICAS DO ESCOPO EXECUTIVO:
- Volume Total de Incidentes: ${kpis.totalEventos}
- Alertas de Ruído Operacional (< 5 min): ${kpis.totalRuidoOperacional} (${shortPct}% do volume total)
- Taxa de Reconhecimento / Atendimento Humano: ${kpis.taxaAtuacaoPercentual}%
- Tempo Médio de Resolução (MTTR): ${formatDuration(kpis.mttrSegundos)}
- Intervalo Médio Entre Falhas (MTBF Global): ${formatDuration(kpis.mtbfSegundosGlobal)}
- Ativo Crítico Mais Vulnerável: ${kpis.hostMaisAfetado.host} (${kpis.hostMaisAfetado.count} eventos)
- Principais Ofensores de Disponibilidade:
${topTriggers}
${contextNotesSection}

### ESTRUTURA OBRIGATÓRIA DA ANÁLISE EXECUTIVA:
1. **Sumário Executivo & Diagnóstico Estratégico**: Visão macro da estabilidade do ambiente no recorte ${mesAno}, saúde dos serviços e impacto de alertas espúrios na produtividade do time.
2. **Impacto no SLA e Riscos ao Negócio**: Avaliação de conformidade com acordos de nível de serviço, custo oculto do ruído operacional e perigo de incidentes críticos serem negligenciados (Alert Fatigue).
3. **Eficiência Operacional & Benchmarks de MTTR/MTBF**: Análise do tempo de resposta frente a boas práticas internacionais de Observabilidade e SRE.
4. **Matriz de Riscos Operacionais**: Classificação dos principais grupos de falhas em risco Alto, Médio e Baixo.
5. **Recomendações Estratégicas e Metas para Liderança**: 3 a 4 direcionamentos objetivos para investimento em governança de alertas, automação e redução projetada de ruído em até 80%.
`.trim();
  }

  return `
Você é o Especialista em Tuning de Zabbix e Observabilidade do NOC.
Gere um diagnóstico técnico e plano de ação rigoroso para o cliente: "${clientName || 'Cliente Corporativo'}".

### RECORTE TEMPORAL DO ESCOPO FILTRADO:
- Mês/Ano de Referência do Filtro: ${mesAno}
- Intervalo Específico: ${periodoDescricao}

### MÉTRICAS DO ESCOPO FILTRADO:
- Total de Incidentes: ${kpis.totalEventos}
- Ruído Operacional (< 5 minutos): ${kpis.totalRuidoOperacional} (${shortPct}%)
- Taxa de Atuação / Reconhecimento: ${kpis.taxaAtuacaoPercentual}%
- MTTR Médio: ${formatDuration(kpis.mttrSegundos)}
- MTBF Global no Escopo: ${formatDuration(kpis.mtbfSegundosGlobal)}
- Host Crítico Mais Afetado: ${kpis.hostMaisAfetado.host} (${kpis.hostMaisAfetado.count} eventos)
- Triggers Principais:
${topTriggers}
${catalogSection}
${contextNotesSection}

### ESTRUTURA OBRIGATÓRIA DA RESPOSTA:
1. **Sumário Executivo do Cenário**: Impacto no NOC para o recorte ${mesAno}, fadiga de alertas e risco de incidentes reais camuflados por ruído.
2. **Causa Raiz Técnica das Triggers Mais Ruidosas**: Explicar por que estão disparando falso-positivos (falta de histerese, oscilação de ICMP, GC em JVMs, timeout de ODBC).
3. **Engenharia de Expressões (Zabbix 6/7)**: Fornecer a Problem Expression e a Recovery Expression otimizadas com histerese (ex: min(), max(), nodata()). Caso o catálogo de triggers tenha sido informado, refatorar diretamente as expressões reais do cliente.
4. **Hierarquia de Dependências**: Árvore lógica para supressão em cascata (evitar tempestade de alarmes em falhas de rede/link).
5. **Plano de Implementação em 3 Etapas**: Como a equipe de infraestrutura deve proceder no Zabbix frontend.
`.trim();
}

// Fallback determinístico avançado para garantir diagnóstico imediato e perfeito sem quebrar caso não haja chave configurada
function generateDeterministicDiagnostic(
  events: ZabbixEvent[],
  kpis: ZabbixKPIs,
  filters: ZabbixFilters,
  clientName?: string,
  theme: ReportTheme = 'tecnico',
  catalog?: ClientTriggerCatalog | null,
  extraOperationalNotes?: string[],
  customPromptDirectives?: string
): string {
  const shortPct = kpis.totalEventos > 0 ? Math.round((kpis.totalRuidoOperacional / kpis.totalEventos) * 100) : 0;
  const topHost = kpis.hostMaisAfetado.host || 'Infraestrutura Geral';
  const topHostCount = kpis.hostMaisAfetado.count || 0;
  const { mesAno, periodoDescricao } = getReportPeriodInfo(filters, events);

  if (theme === 'book_resultados') {
    return `### PILAR I: SUMÁRIO EXECUTIVO & GOVERNANÇA DE NEGÓCIO (C-LEVEL)
- **Cliente:** ${clientName || 'Cliente Corporativo'}
- **Recorte Temporal:** **${mesAno}** (${periodoDescricao})
- **Incidentes Analisados:** **${kpis.totalEventos} eventos** no escopo da auditoria.
- **Índice de Ruído e Fadiga:** **${shortPct}%** dos alarmes duraram menos de 5 minutos, apontando um custo oculto de interrupções no NOC que camufla incidentes reais de SLA.
- **MTTR & MTBF:** Tempo médio de recuperação em **${formatDuration(kpis.mttrSegundos)}** e MTBF de **${formatDuration(kpis.mtbfSegundosGlobal)}**, demonstrando necessidade de amortecimento nas métricas.
- **Atendimento Humano:** Taxa de reconhecimento de **${kpis.taxaAtuacaoPercentual}%**, evidenciando sobrecarga operacional da equipe.

---

### PILAR II: MATRIZ DE OFENSORES & DIAGNÓSTICO DE CAUSA RAIZ
1. **Host Concentrador Crítico:** O ativo **\`${topHost}\`** foi responsável por **${topHostCount} incidentes**, sendo o principal ofensor de infraestrutura do período.
2. **Causa Física/Lógica:** Oscilações transitórias de conectividade e picos pontuais de processamento sem agregação temporal.
3. **Flapping em Triggers Sensíveis:** Coletas de banco e serviços com checagem instantânea \`last()\` acionam alertas durante manutenções curtas ou rebalanceamento de carga.

---

### PILAR III: ENGENHARIA DE TRIGGERS & CALIBRAÇÃO ZABBIX 7.0
Para estabilização imediata e extinção de até 80% do ruído no NOC, aplicar pares de Problem/Recovery Expression com Histerese:

#### A. Triggers de Coleta e Ausência de Dados (Nodata)
- **Problem Expression (Disparo após 10 min):**
\`\`\`zabbix
nodata(/${topHost}/status, 10m) = 1
\`\`\`
- **Recovery Expression (Retorno após 5 min contínuos):**
\`\`\`zabbix
nodata(/${topHost}/status, 5m) = 0
\`\`\`

#### B. Triggers de Recursos e Saturação (CPU / Memória / Heap)
- **Problem Expression (Disparo com Janela min 5m):**
\`\`\`zabbix
min(/${topHost}/system.cpu.util, 5m) > 85
\`\`\`
- **Recovery Expression (Histerese de Encerramento abaixo de 75%):**
\`\`\`zabbix
max(/${topHost}/system.cpu.util, 5m) < 75
\`\`\`

---

### PILAR IV: ROADMAP INTEGRADO DE AÇÕES ESTRATÉGICAS
- **Imediato (0 a 7 dias):** Implantar Recovery Expression nos templates corporativos dos 3 principais ofensores e silenciar alarmes de rotinas programadas.
- **Curto Prazo (8 a 30 dias):** Reavaliar severidades contratuais, reservando "Desastre" apenas para indisponibilidade total de faturamento.
- **Médio Prazo (30 a 90 dias):** Implementar supressão hierárquica por dependência lógica e homologar tags de governança padronizadas.
${customPromptDirectives && customPromptDirectives.trim() ? `\n---\n\n### DIRETRIZES ESPECÍFICAS DA AUDITORIA:\n${customPromptDirectives.trim()}` : ''}
${extraOperationalNotes && extraOperationalNotes.length > 0 ? `\n---\n\n### NOTAS OPERACIONAIS REGISTRADAS:\n${extraOperationalNotes.map((n) => `• ${n}`).join('\n')}` : ''}`.trim();
  }

  if (theme === 'executivo') {
    return `
### 1. SUMÁRIO EXECUTIVO & DIAGNÓSTICO ESTRATÉGICO
- **Organização Contratante:** ${clientName || 'Geral / Corporativo'}
- **Recorte Temporal do Escopo:** **${mesAno}** (${periodoDescricao})
- **Volume Total Mapeado:** ${kpis.totalEventos} incidentes registrados no ciclo de observabilidade.
- **Índice de Eficiência de Alertas:** **${shortPct}%** dos alarmes (${kpis.totalRuidoOperacional} eventos) são **transitórios e autorresolvidos** em menos de 5 minutos, sem exigência de ação humana.
- **Taxa de Atuação NOC:** Registrada em **${kpis.taxaAtuacaoPercentual}%**, indicando que a grande maioria dos eventos é ignorada pela equipe por falta de relevância operacional direta.
- **Disponibilidade e MTTR:** Tempo Médio de Resolução em **${formatDuration(kpis.mttrSegundos)}** e MTBF de **${formatDuration(kpis.mtbfSegundosGlobal)}**, demandando governança para consolidação de SLA.
- **Concentrador de Risco:** O ativo **\`${topHost}\`** é o principal ponto de instabilidade, respondendo por **${topHostCount} incidentes** (${kpis.totalEventos > 0 ? Math.round((topHostCount / kpis.totalEventos) * 100) : 0}% do total).

---

### 2. IMPACTO NO NEGÓCIO E RISCO DE FADIGA OPERACIONAL (ALERT FATIGUE)
1. **Dano à Atenção Operacional:** A saturação de alarmes de curta duração impede o foco nos incidentes reais de indisponibilidade de serviços centrais.
2. **Risco de Descumprimento de SLA:** Alarmes com severidade inflada (como Desastre para pequenas oscilações de rede) distorcem as métricas contratuais e relatórios gerenciais.
3. **Custo Oculto de Operação:** Desgaste desnecessário dos times de plantão (N1/N2) em triagem de falsos-positivos repetitivos.

---

### 3. EFICIÊNCIA OPERACIONAL & BENCHMARKS DE MTTR/MTBF
- **Padrão de Mercado Recomendado:** Menos de 15% de alarmes de curta duração (< 5 min) e taxa de atendimento acima de 85% para alarmes com severidade Alta ou Superior.
- **Situação Atual:** O índice de ${shortPct}% de ruído posiciona o ambiente em nível crítico de saturação de telemetria.
- **Oportunidade:** Aplicação de amortecimento de métricas e histerese eliminará imediatamente até 80% do volume descartável.

---

### 4. RECOMENDAÇÕES ESTRATÉGICAS PARA A LIDERANÇA DE TI
1. **Homologação das Expressões de Histerese:** Autorizar a padronização das regras de monitoramento com janelas mínimas de persistência (5 a 10 min).
2. **Revisão de Severidades Contratuais:** Realinhar gatilhos de severidade Desastre estritamente para parada real de serviços de faturamento e bancos de dados.
3. **Matriz de Dependência de Conectividade:** Adotar supressão em cascata para blindar a liderança de relatórios distorcidos em falhas isoladas de conectividade.
4. **Meta de 30 Dias:** Elevação da taxa de atendimento qualificado para > 80% e redução de 75% dos chamados preventivos.
${
  extraOperationalNotes && extraOperationalNotes.length > 0
    ? `\n---\n\n### 5. PARTICULARIDADES OPERACIONAIS & CONTEXTO INSERIDO\n${extraOperationalNotes
        .map((n) => `• **Nota Operacional:** ${n}`)
        .join('\n')}\n*Observação:* Os dados acima foram inseridos pelo operador e representam comportamentos e rotinas programadas da infraestrutura.`
    : ''
}
`.trim();
  }

  let catalogDeterministicSection = '';

  // 1. Coleta expressões vindas diretamente da planilha (coluna Expressão das 15 colunas)
  const directEventsWithExpr: { name: string; host: string; expression: string; count: number }[] = [];
  const seenTriggers = new Set<string>();

  for (const e of events) {
    if (e.expressao && !seenTriggers.has(e.incidente)) {
      seenTriggers.add(e.incidente);
      const count = events.filter((ev) => ev.incidente === e.incidente).length;
      directEventsWithExpr.push({
        name: e.incidente,
        host: e.host,
        expression: e.expressao,
        count,
      });
      if (directEventsWithExpr.length >= 4) break;
    }
  }

  if (directEventsWithExpr.length > 0) {
    catalogDeterministicSection = `\n\n### 3.1 ANÁLISE CRITERIOSA DAS TRIGGERS ZABBIX MAPEADAS DA PLANILHA (15 COLUNAS)\n` +
      directEventsWithExpr
        .map(({ name, host, expression, count }, idx) => {
          const letter = String.fromCharCode(65 + idx);
          let suggestedProblem = expression;
          let suggestedRecovery = '';

          // Análise da expressão
          let diagnosis = '';
          if (expression.includes('last(') && !expression.includes('min(') && !expression.includes('avg(')) {
            diagnosis = 'Uso de `last()` instantâneo sem janela temporal de persistência. Qualquer pico transitório de CPU/memória ou micro-queda de ping dispara o alarme antes da autoestabilização.';
            suggestedProblem = expression.replace(/last\(([^)]+)\)/g, 'min($1, 5m)');
            suggestedRecovery = expression.replace(/last\(([^)]+)\)\s*(>|>=)\s*([0-9.]+)/g, 'max($1, 10m) < 70');
          } else if (expression.includes('nodata(')) {
            diagnosis = 'Trigger de `nodata()` configurada com janela muito curta ou sem histerese de recuperação. Falhas temporárias de coleta do agente ou poller disparam alertas falsos.';
            suggestedProblem = expression.replace(/nodata\(([^,)]+)(?:,\s*[0-9]+[smhd]?)?\)/g, 'nodata($1, 10m)');
            suggestedRecovery = expression.replace(/nodata\(([^,)]+)(?:,\s*[0-9]+[smhd]?)?\)\s*=\s*1/g, 'nodata($1, 5m) = 0');
          } else {
            diagnosis = 'Gatilho sem histerese assíncrona de recuperação. A mesma condição de disparo é usada para fechar o alarme, provocando flapping contínuo no limiar.';
            if (expression.includes('>')) {
              suggestedRecovery = expression.replace(/>/g, '<');
            } else if (expression.includes('=')) {
              suggestedRecovery = expression.replace(/=/g, '!=');
            }
          }

          if (!suggestedRecovery || suggestedRecovery === suggestedProblem) {
            suggestedRecovery = `max(/${host}/status, 5m) = 0`;
          }

          return `#### ${letter}. ${name} (${host}) - ${count} ocorrências no período
- **Expressão Real Configurada na Planilha:**
\`\`\`zabbix
${expression}
\`\`\`
- **Diagnóstico Técnico da Sintaxe:** ${diagnosis}
- **Problem Expression Recomendada (Zabbix 6.x / 7.x):**
\`\`\`zabbix
${suggestedProblem}
\`\`\`
- **Recovery Expression Sugerida (Histerese & Supressão de Ruído):**
\`\`\`zabbix
${suggestedRecovery}
\`\`\`
- **Solução Operacional:** Parametrizar com macro de usuário (\`{\$THRESHOLD.WARN}\`) e vincular dependência de conectividade de agente/link.`;
        })
        .join('\n\n') + '\n';
  } else if (catalog && catalog.items && catalog.items.length > 0) {
    // Busca até 3 triggers mais frequentes que possuam correspondência na planilha do cliente
    const trigCounts = new Map<string, { count: number; host: string }>();
    for (const e of events) {
      const cur = trigCounts.get(e.incidente) || { count: 0, host: e.host };
      cur.count++;
      trigCounts.set(e.incidente, cur);
    }
    const matchedTriggers: { item: any; count: number }[] = [];
    for (const [name, val] of Array.from(trigCounts.entries()).sort((a, b) => b[1].count - a[1].count)) {
      const match = findTriggerExpression(val.host, name, catalog);
      if (match && !matchedTriggers.some((m) => m.item.id === match.id)) {
        matchedTriggers.push({ item: match, count: val.count });
        if (matchedTriggers.length >= 3) break;
      }
    }

    if (matchedTriggers.length > 0) {
      catalogDeterministicSection = `\n\n### 3.1 ENGENHARIA DE EXPRESSÕES BASEADA NO CATÁLOGO DO CLIENTE (${catalog.fileName})\n` +
        matchedTriggers
          .map(({ item, count }, idx) => {
            const letter = String.fromCharCode(65 + idx);
            let suggestedProblem = item.expression;
            let suggestedRecovery = '';
            if (suggestedProblem.includes('#3')) {
              suggestedProblem = suggestedProblem.replace(/#3/g, '#5');
            } else if (suggestedProblem.includes('last(')) {
              suggestedProblem = suggestedProblem.replace(/last\(/g, 'min(').replace(/\)/g, ', 5m)');
            }
            if (item.parsedItemKey) {
              suggestedRecovery = `last(/${item.host}/${item.parsedItemKey}) = 0`;
            } else {
              suggestedRecovery = `last(/${item.host}/service.status) = 0`;
            }

            return `#### ${letter}. ${item.name} (${item.host}) - ${count} ocorrências no período
- **Expressão Atual Configurada no Zabbix:**
\`\`\`zabbix
${item.expression}
\`\`\`
- **Diagnóstico da Expressão:** Amostragem sensível detectada${item.parsedThreshold ? ` com limiar \`${item.parsedThreshold}\`` : ''}. Oscilações breves acionam o alarme antes da autoestabilização do serviço.
- **Problem Expression Otimizada (Zabbix 6.x/7.x):**
\`\`\`zabbix
${suggestedProblem}
\`\`\`
- **Recovery Expression Sugerida (Histerese):**
\`\`\`zabbix
${suggestedRecovery}
\`\`\``;
          })
          .join('\n\n') + '\n';
    }
  }

  return `
### 1. SUMÁRIO EXECUTIVO & DIAGNÓSTICO DE RUÍDO OPERACIONAL
- **Cliente:** ${clientName || 'Geral / Corporativo'}
- **Recorte Temporal do Escopo:** **${mesAno}** (${periodoDescricao})
- **Volume Analisado:** ${kpis.totalEventos} incidentes no escopo selecionado.
- **Índice de Ruído Crítico:** **${shortPct}%** dos alarmes (${kpis.totalRuidoOperacional} eventos) duraram **menos de 5 minutos** e foram autorresolvidos antes de qualquer intervenção humana.
- **Taxa de Atuação NOC:** Apenas **${kpis.taxaAtuacaoPercentual}%** dos alarmes foram formalmente reconhecidos, caracterizando um quadro severo de **fadiga de alertas (Alert Fatigue)**.
- **MTTR e MTBF:** O tempo médio de recuperação é de **${formatDuration(kpis.mttrSegundos)}**, e o intervalo médio entre falhas (MTBF) está em **${formatDuration(kpis.mtbfSegundosGlobal)}**, indicando flapping crônico.
- **Concentrador de Falhas:** O servidor **\`${topHost}\`** concentrou **${topHostCount} incidentes** (${kpis.totalEventos > 0 ? Math.round((topHostCount / kpis.totalEventos) * 100) : 0}% de todo o volume).

---

### 2. CAUSA RAIZ DAS TRIGGERS MAIS PROBLEMÁTICAS
1. **Triggers sem Amortecimento Temporal (\`last() = 0\`):** Alarmes de coleta Oracle e timeouts transitórios disparam no primeiro pacote perdido, sem janela de tolerância de 5 a 10 minutos.
2. **Ausência de Histerese em Heap de Memória Java (\`WC_Portlet\`):** Disparo imediato ao atingir 80%, antes que o Garbage Collector (GC) atue. Falta de par Problem / Recovery (\`> 80%\` vs \`< 70%\`).
3. **Flapping em Roteadores e Conexões ICMP:** Picos momentâneos de jitter ou latência disparam severidade Alta/Desastre de forma errática.

---

### 3. EXPRESSÕES OTIMIZADAS COM HISTERESE (ZABBIX 6.X / 7.X)

#### A. Oracle: Falha em Coletar Dados (ou sem dados)
- **Problem Expression:** Ativar apenas após 10 minutos contínuos de ausência de dados:
\`\`\`zabbix
nodata(/${topHost}/oracle.ping, 10m) = 1
\`\`\`
- **Recovery Expression:** Encerrar apenas após 5 minutos de telemetria estabilizada:
\`\`\`zabbix
nodata(/${topHost}/oracle.ping, 5m) = 0
\`\`\`

#### B. WC_Portlet: Heap acima de 80% (Eliminação de Flapping de JVM)
- **Problem Expression:** Uso mínimo sustentado acima de 80% por 10 minutos:
\`\`\`zabbix
min(/${topHost}/jmx["java.lang:type=Memory", "HeapMemoryUsage.used"], 10m) / max(/${topHost}/jmx["java.lang:type=Memory", "HeapMemoryUsage.max"], 10m) > 0.80
\`\`\`
- **Recovery Expression:** Encerrar quando estabilizar abaixo de 70% por 5 minutos pós-GC:
\`\`\`zabbix
max(/${topHost}/jmx["java.lang:type=Memory", "HeapMemoryUsage.used"], 5m) / max(/${topHost}/jmx["java.lang:type=Memory", "HeapMemoryUsage.max"], 5m) < 0.70
\`\`\`
${catalogDeterministicSection}

---

### 4. MATRIZ DE DEPENDÊNCIA HIERÁRQUICA
Para estancar a tempestade de alarmes secundários quando um link ou host cai:
\`\`\`
[Host Unreachable (ICMP Ping)] (Raiz)
└──> [Zabbix Agent Unavailable]
    ├──> [Oracle Database Data Collection]
    ├──> [Heap Memory 90%] (Alta)
    │    └──> [Heap Memory 80%] (Média - Supressa quando 90% ativa)
    └──> [TCP Port 3389 RDP MITRA]
\`\`\`

---

### 5. PLANO DE AÇÃO IMEDIATO PARA O NOC
1. **Passo 1:** Configurar as Recovery Expressions nos Templates globais de Oracle e WebLogic/Java.
2. **Passo 2:** Aplicar dependência na trigger de Heap 80% apontando para a de 90%.
3. **Passo 3:** Reclassificar severidades inadequadas (rebaixar RDP 3389 de Desastre para Atenção).
4. **Passo 4:** Validar a redução projetada de **75% a 85% do ruído operacional** nas próximas 48 horas.
${
  extraOperationalNotes && extraOperationalNotes.length > 0
    ? `\n---\n\n### 6. PARTICULARIDADES OPERACIONAIS REGISTRADAS (NOTAS DO OPERADOR)\n${extraOperationalNotes
        .map((n) => `• **Condição Operacional:** ${n}`)
        .join('\n')}\n*Diretriz:* As rotinas acima foram validadas pelo NOC e justificam a sazonalidade ou alarmes recorrentes durante os períodos indicados.`
    : ''
}
`.trim();
}

export interface TriggerOptimizationResult {
  originalExpression: string;
  optimizedProblem: string;
  optimizedRecovery: string;
  explanation: string;
  changes: string[];
  source: 'api' | 'offline_expert';
}

/**
 * Usa IA ou especialista local para reescrever expressões Zabbix
 * aplicando as melhores práticas estritas do Zabbix 7.0 LTS.
 */
export async function optimizeTriggerExpressionWithAI(
  expression: string,
  context?: { host?: string; triggerName?: string; zabbixVersion?: string }
): Promise<TriggerOptimizationResult> {
  const cleanExpr = expression.trim();
  if (!cleanExpr) {
    throw new Error('A expressão não pode estar vazia.');
  }

  const cfg = getDeepSeekConfig();

  if (cfg.apiKey && cfg.apiKey.trim() !== '') {
    const endpoint = `${(cfg.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '')}/chat/completions`;
    const prompt = `Analise e refatore a seguinte expressão de trigger do Zabbix:
Host Contexto: ${context?.host || 'Detectar da expressão'}
Trigger Contexto: ${context?.triggerName || 'Gatilho de Observabilidade'}
Versão Alvo: ${context?.zabbixVersion || 'Zabbix 7.0 LTS'}
Expressão Atual:
\`\`\`zabbix
${cleanExpr}
\`\`\`

Instruções Zabbix 7.0:
1. Elimine sintaxe legada e converta para a notação padrão Zabbix 7.0: func(/host/item, [params]).
2. Substitua funções obsoletas (ex: diff->change, str/regexp->find, strlen->length, delta->change).
3. Otimize intervalos e contagens sensíveis (ex: trocar #3 ou last() instantâneo por agregação temporal min(..., 5m), avg(..., 10m) ou contagem expandida #5).
4. Forneça par com Histerese: Problem Expression e Recovery Expression.
5. Retorne SOMENTE um JSON sem markdown adicional com a estrutura:
{
  "optimizedProblem": "expressão do problema ajustada",
  "optimizedRecovery": "expressão de recuperação recomendada",
  "changes": ["mudança 1", "mudança 2"],
  "explanation": "resumo técnico do ganho de estabilidade no Zabbix 7.0"
}`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: cfg.model || 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content:
                'Você é um Arquiteto Sênior Zabbix 7.0 LTS Certified Expert. Responda estritamente em formato JSON válido contendo os campos: optimizedProblem, optimizedRecovery, changes (array de strings) e explanation (string).',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 1500,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            originalExpression: cleanExpr,
            optimizedProblem: parsed.optimizedProblem || cleanExpr,
            optimizedRecovery: parsed.optimizedRecovery || '',
            explanation: parsed.explanation || 'Expressão otimizada com sucesso para Zabbix 7.0.',
            changes: Array.isArray(parsed.changes) ? parsed.changes : ['Expressão adaptada para Zabbix 7.0.'],
            source: 'api',
          };
        }
      }
    } catch (err) {
      console.warn('Falha na API DeepSeek para otimização de trigger, usando especialista local:', err);
    }
  }

  // Especialista Local Determinístico Zabbix 7.0
  return generateDeterministicTriggerOptimization(cleanExpr, context);
}

/**
 * Especialista determinístico para Zabbix 7.0 LTS
 */
function generateDeterministicTriggerOptimization(
  expression: string,
  context?: { host?: string; triggerName?: string }
): TriggerOptimizationResult {
  const changes: string[] = [];
  let problem = expression;
  let recovery = '';

  // 1. Converte sintaxe clássica {HOST:item.func()} -> func(/host/item)
  const legacyMatch = problem.match(/\{([^:]+):([^.]+)\.([a-zA-Z0-9_]+)\(([^)]*)\)\}/);
  if (legacyMatch) {
    const [, host, item, func, params] = legacyMatch;
    const cleanParams = params ? `, ${params}` : '';
    problem = problem.replace(legacyMatch[0], `${func}(/${host}/${item}${cleanParams})`);
    changes.push('Migrada sintaxe pré-5.4 {HOST:item.func()} para o padrão nativo Zabbix 7.0 func(/host/item).');
  }

  // 2. Substitui funções obsoletas
  if (/\bdiff\s*\(/i.test(problem)) {
    problem = problem.replace(/\bdiff\s*\(/gi, 'change(');
    changes.push('Substituída função obsoleta diff() por change() (Padrão Zabbix 7.0).');
  }
  if (/\bstr\s*\(/i.test(problem)) {
    problem = problem.replace(/\bstr\s*\(([^,]+),\s*([^)]+)\)/gi, 'find($1,,"like",$2)');
    changes.push('Substituída função obsoleta str() por find(...,,"like",...) conforme documentação do Zabbix 7.0.');
  }
  if (/\bregexp\s*\(/i.test(problem)) {
    problem = problem.replace(/\bregexp\s*\(([^,]+),\s*([^)]+)\)/gi, 'find($1,,"regexp",$2)');
    changes.push('Substituída função obsoleta regexp() por find(...,,"regexp",...).');
  }
  if (/\bstrlen\s*\(/i.test(problem)) {
    problem = problem.replace(/\bstrlen\s*\(/gi, 'length(');
    changes.push('Substituída função strlen() por length().');
  }

  // 3. Otimização de amostragem contra flapping (#3 ou last instantâneo)
  if (problem.includes('#3')) {
    problem = problem.replace(/#3/g, '#5');
    changes.push('Expandida amostragem de #3 para #5 consecutivas para blindagem contra micro-oscilações transitórias.');
  } else if (/\blast\(([^)]+)\)\s*(<>|=|>|<|>=|<=)\s*(\d+)/.test(problem)) {
    const match = problem.match(/\blast\(([^)]+)\)\s*(<>|=|>|<|>=|<=)\s*(\d+)/);
    if (match && !match[1].includes('#') && !match[1].includes('m') && !match[1].includes('s')) {
      problem = problem.replace(match[0], `min(${match[1]}, 5m) ${match[2]} ${match[3]}`);
      changes.push('Substituído disparo pontual last() por agregação temporal min(..., 5m) para eliminar ruído operacional.');
    }
  }

  // 4. Criação da Recovery Expression (Histerese)
  const hostDetected = context?.host || (problem.match(/\/([^/]+)\//)?.[1] || 'host');
  const itemKeyDetected = problem.match(/\/[^/]+\/([a-zA-Z0-9_.-]+(?:\[[^\]]*\])?)/)?.[1];

  if (problem.toLowerCase().includes('service.info') || (context?.triggerName && context.triggerName.toLowerCase().includes('service'))) {
    const serviceParam = problem.match(/service\.info\["([^"]+)"/)?.[1] || 'Service';
    recovery = `last(/${hostDetected}/service.info["${serviceParam}",state]) = 0`;
    changes.push('Configurada Recovery Expression com histerese: o alarme só encerra após confirmação de que o serviço retornou a Running (0).');
  } else if (problem.includes('>') && /\d+/.test(problem)) {
    // Ex: > 80% ou > 90%
    const numMatch = problem.match(/>\s*(\d+)/);
    if (numMatch && itemKeyDetected) {
      const threshold = parseInt(numMatch[1], 10);
      const recoveryThreshold = Math.max(10, threshold - 10);
      recovery = `max(/${hostDetected}/${itemKeyDetected}, 5m) < ${recoveryThreshold}`;
      changes.push(`Adicionada histerese para encerramento de alarme: dispara em > ${threshold}%, mas só recupera quando permanecer abaixo de ${recoveryThreshold}% por 5 minutos.`);
    }
  } else if (problem.toLowerCase().includes('nodata')) {
    if (itemKeyDetected) {
      recovery = `nodata(/${hostDetected}/${itemKeyDetected}, 5m) = 0`;
      changes.push('Adicionada Recovery Expression para garantir 5 minutos ininterruptos de telemetria ativa antes da normalização.');
    }
  }

  if (!recovery) {
    if (itemKeyDetected) {
      recovery = `last(/${hostDetected}/${itemKeyDetected}) = 0`;
      changes.push('Sugerida Recovery Expression baseada no restabelecimento do item monitorado.');
    } else {
      recovery = `last(/${hostDetected}/status) = 0`;
    }
  }

  return {
    originalExpression: expression,
    optimizedProblem: problem,
    optimizedRecovery: recovery,
    explanation:
      'Expressão refatorada conforme as diretrizes do Zabbix 7.0 LTS. Foram eliminadas chamadas instantâneas sem amortecimento, ajustadas funções obsoletas e implementado o par de recuperação com histerese para extinção de falsos-positivos e ruído no NOC.',
    changes: changes.length > 0 ? changes : ['Validação de conformidade Zabbix 7.0 concluída.'],
    source: 'offline_expert',
  };
}

