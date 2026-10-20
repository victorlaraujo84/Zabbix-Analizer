# Zabbix Report Analyzer - Alinhamento Dinâmico de Prompts com Filtros Selecionados

Plano de implementação para garantir que todos os prompts de IA gerados (Tuning de Triggers / Ruído Operacional e Resumo Executivo Formal) reflitam fidedignamente o escopo exato dos filtros selecionados pelo usuário no painel, documentando os filtros ativos no topo e adaptando dinamicamente as tarefas e objetivos solicitados à IA.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Decisões Confirmadas com o Usuário:**
> - **Bloco Explícito de Escopo:** Inclusão de uma seção destacada no topo do prompt detalhando cada filtro ativo (Período, Severidades selecionadas, Hosts filtrados, Triggers selecionadas, Status, Reconhecimento, Faixa de Duração e Tags), além de indicar a proporção em relação ao dataset total (ex: "Exibindo 12 de 24 eventos").
> - **Adaptação Dinâmica do Objetivo da IA:** As instruções fornecidas ao modelo (Gemini/ChatGPT/Claude) serão adaptadas contextualizadamente dependendo do filtro ativo (ex: se o usuário filtrou por um Host específico, a IA é instruída a realizar um "Deep-Dive de Confiabilidade no Host X"; se filtrou por severidade "Desastre", a instrução foca em "Análise Post-Mortem de Incidentes Críticos"; se filtrou por ruído `< 1m`, a instrução prioriza "Diagnóstico de Flapping de Altíssima Frequência").

---

### 1. Overview & Core Concept

- **Problema Atual:** Os prompts gerados calculavam métricas a partir dos eventos filtrados, mas não explicitavam para a IA quais filtros estavam ativos e mantinham um enunciado genérico sem contextualizar o escopo selecionado (ex: o usuário filtrou por um host específico ou por status `INCIDENTE`, mas o prompt não explicava esse recorte).
- **Solução:**
  1. Função de formatação do escopo dos filtros (`describeActiveFilters(filters, totalRaw, totalFiltered)`).
  2. Ajuste dinâmico do título, persona e objetivos em `generateTriggerTuningPrompt` e `generateExecutiveReportPrompt` com base nos filtros aplicados.
  3. Indicação visual no modal do prompt informando quais filtros estão delimitando aquele texto gerado.

---

### 2. User Experience & Visual Design

#### Atualização no Modal de Prompts (`PromptModal.tsx`)
- Adição de uma faixa superior de contexto: *"Gerado com base em X filtros ativos (Host: Y, Severidade: Z...)"* para que o usuário veja imediatamente que o prompt corresponde ao que ele filtrou.
- O prompt conterá a seção:
  ```markdown
  ### ESCOPO DOS FILTROS APLICADOS NESTA ANÁLISE:
  - Período Analisado: [De ... até ... ou Todo o Período]
  - Hosts Selecionados: [Lista dos hosts ou "Todos os hosts"]
  - Severidades: [Lista das severidades ou "Todas"]
  - Triggers Específicas: [Lista ou "Todas"]
  - Status dos Incidentes: [RESOLVIDO / INCIDENTE / Todos]
  - Reconhecimento (Ack): [Sim / Não / Todos]
  - Filtro de Duração: [Ruído < 1m, 1m-5m, ou customizado]
  - Etiquetas (Tags): [Chave = Valor ou "Nenhuma"]
  - Volume Amostral: [X eventos filtrados de um total de Y eventos]
  ```

#### Adaptação Contextual do Enunciado
- **Filtro de Host Ativo:** O prompt se transforma em uma auditoria dedicada: *"Você está realizando uma auditoria técnica detalhada focada no(s) host(s) [Nome do Host]..."*.
- **Filtro de Status `INCIDENTE`:** Foco em sala de crise (War Room): *"Você está atuando em modo War Room para incidentes ainda NÃO resolvidos..."*.
- **Filtro de Duração Curta (`< 1m` ou `< 5m`):** Foco em supressão de alarmes falsos e ruído de rede.
- **Filtro de Severidade `Desastre` ou `Alta`:** Foco em impacto ao negócio, SLA e mitigação de indisponibilidade severa.

---

### 3. Key Product Decisions & Trade-Offs

- **Transparência Total no Prompt:**
  - *Abordagem:* Em vez de apenas passar números isolados, o prompt contextualiza para a IA *por que* aqueles números são aqueles (ex: "A taxa de resolução é 0% porque este relatório está filtrado exclusivamente por incidentes em aberto").
  - *Vantagem:* Evita que a IA alucine diagnósticos errôneos (por exemplo, achar que a infraestrutura inteira caiu quando o operador estava apenas filtrando o host do banco de dados).

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Fluxo de Geração dos Prompts                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Estado dos Filtros (App.tsx): filters + rawEvents + filteredEvents      │
│     │                                                                       │
│     ├──> describeActiveFilters(filters, rawEvents.length, filtered.length)  │
│     │                                                                       │
│     ├──> generateTriggerTuningPrompt(filtered, kpis, filters, rawTotal)     │
│     │    - Inclui bloco [ESCOPO DOS FILTROS APLICADOS]                      │
│     │    - Adapta persona e perguntas com base nos filtros                  │
│     │                                                                       │
│     └──> generateExecutiveReportPrompt(filtered, kpis, filters, rawTotal)   │
│          - Inclui bloco [ESCOPO DOS FILTROS APLICADOS]                      │
│          - Modula tom de C-Level (War Room, Auditoria de Host, Geral)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Modificações Técnicas Planejadas
- `src/utils/analytics.ts`:
  - Criar função utilitária `formatActiveFiltersSummary(filters: ZabbixFilters, rawTotal: number, filteredTotal: number): string`.
  - Atualizar assinaturas de `generateTriggerTuningPrompt` e `generateExecutiveReportPrompt` para receber `filters` e `rawTotal`.
  - Inserir blocos dinâmicos de contextualização de escopo e objetivos condicionais.
- `src/components/PromptModal.tsx`:
  - Adicionar badge/resumo do filtro ativo na interface para feedback visual imediato.
- `src/App.tsx`:
  - Passar os parâmetros `filters` e `rawEvents.length` nas chamadas de geração de prompt memoizadas.
