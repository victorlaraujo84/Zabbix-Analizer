# Plano de Implementação Revisado: Disponibilidade Média do Ambiente com Horas Calendário do Mês / Período

Ajuste do cálculo da Disponibilidade Média do Ambiente no motor analítico do Zabbix Analyzer, aplicando a regra de **horas totais disponíveis baseada na quantidade real de dias do mês analisado** (ex: 31 dias = 744h, 30 dias = 720h, 28/29 dias em fevereiro, ou dias exatos da seleção ativa), integrado com a média aritmética por host e novo card dedicado no Dashboard e Relatórios.

---

## 1. Regra de Horas Totais Disponíveis (Regime 24x7)

As horas totais de referência para o uptime planejado de cada host são calculadas dinamicamente:

1. **Quando o escopo cobre um mês civil específico (ou filtro de mês/ano)**:
   - Se o mês analisado tiver **31 dias** (Jan, Mar, Mai, Jul, Ago, Out, Dez):  
     $$24 \times 31 = \mathbf{744\text{ horas}}\ (2.678.400\text{ segundos})$$
   - Se o mês analisado tiver **30 dias** (Abr, Jun, Set, Nov):  
     $$24 \times 30 = \mathbf{720\text{ horas}}\ (2.592.000\text{ segundos})$$
   - Se o mês for **Fevereiro**:  
     $$24 \times 28 = \mathbf{672\text{ horas}}\ \text{ou}\ 24 \times 29 = \mathbf{696\text{ horas}}$$
2. **Quando há seleção específica de dias no filtro (`dateFrom` / `dateTo` ou intervalo de eventos)**:
   - Determina-se a quantidade exata de dias cobertos pelo intervalo:  
     $$N_{\text{dias}} = \max\left(1, \left\lceil \frac{\text{Data Fim} - \text{Data Início}}{86.400\text{ segundos}} \right\rceil\right)$$
   - Horas totais planejadas $= N_{\text{dias}} \times 24\text{ horas}$.

---

## 2. Metodologia de Disponibilidade Média Multi-Host

Para evitar que a soma do downtime de múltiplos ativos ultrapasse a janela e zere a disponibilidade do ambiente, o cálculo opera por host e depois consolida a média aritmética:

$$\text{Disponibilidade}(h) = \max\left(0, \frac{\text{Uptime Planejado}(h) - \text{Downtime Não Planejado}(h)}{\text{Uptime Planejado}(h)}\right) \times 100\%$$

$$\text{Disponibilidade Média do Ambiente} = \frac{1}{N_{\text{hosts}}} \sum_{h=1}^{N_{\text{hosts}}} \text{Disponibilidade}(h)$$

Onde:
- **$\text{Uptime Planejado}(h)$**: Horas totais do mês/período ($744\text{h}$, $720\text{h}$, etc.) menos as manutenções preventivas programadas daquele host.
- **$\text{Downtime Não Planejado}(h)$**: Duração acumulada de incidentes críticos de indisponibilidade (`isCriticalOutageEvent`) sofridos pelo host $h$.
- **$N_{\text{hosts}}$**: Quantidade de hosts do escopo ativo.

---

## 3. Modificações nos Arquivos

### 3.1. `src/utils/analytics.ts`
- Implementar função auxiliar `calculatePeriodPlannedHours(minDate: Date | null, maxDate: Date | null, activeFilters?: ZabbixFilters)`:
  - Detecta o mês/ano dos dados ou do filtro.
  - Se cobrir um mês completo ou padrão mensal, retorna os dias reais do mês (ex: Outubro $\to 31 \times 24 = 744\text{h}$).
  - Se for recorte parcial por data de início/fim, calcula os dias exatos selecionados $\times 24\text{h}$.
- Em `computeKPIs`:
  - Utilizar a janela de horas planejadas calculada pela regra de dias do mês.
  - Para cada host em `hostCounts`: calcular a sua disponibilidade individual.
  - Calcular a média aritmética de todos os hosts e registrar em `taxaDisponibilidadeMediaPct` e `taxaDisponibilidadePct`.
  - Gerar o ranking dos principais ofensores de disponibilidade (`disponibilidadePorHost`).
- Atualizar prompts de IA (`generateTriggerTuningPrompt`, `generateExecutiveReportPrompt`, `generateBookDeResultadosPrompt`) citando a base horária do mês (ex: 744h ou 720h).

### 3.2. `src/types/zabbix.ts`
- Adicionar ao `ZabbixKPIs`:
  - `taxaDisponibilidadeMediaPct: number;`
  - `totalHorasPlanejadasPeriodo: number;`
  - `totalDiasPeriodo: number;`
  - `disponibilidadePorHost: Array<{ host: string; disponibilidadePct: number; downtimeSegundos: number; falhasCriticas: number }>;`

### 3.3. `src/components/KPICards.tsx`
- Adicionar novo card em destaque para **Disponibilidade Média**:
  - Exibe o valor percentual (ex: `99.82%`) com código de cores semântico (Verde $\ge 99\%$, Âmbar $95\% - 98.9\%$, Vermelho $< 95\%$).
  - Subtítulo com base horária transparente: `Base: 744h (31 dias) · N hosts` ou `Base: 720h (30 dias) · N hosts`.
  - Botão interativo para abrir o detalhamento da disponibilidade de cada host (ranking de ofensores de SLA).
- Atualizar o modal do MTBF com o demonstrativo das horas calendário do mês analisado.

### 3.4. `src/components/ReportModal.tsx`, `PresentationModal.tsx` & `src/utils/pptxExport.ts`
- Atualizar exibições, tabelas e sínteses com a Disponibilidade Média real calculada sobre os dias do mês (744h / 720h / etc.).

---

## 4. Testes e Validação
- **Verificação com mês de 31 dias**: Confirmar que a base horária é de exatamente 744 horas (2.678.400s).
- **Verificação com mês de 30 dias**: Confirmar que a base horária é de 720 horas (2.592.000s).
- **Verificação multi-host**: Confirmar que o downtime de múltiplos ativos não zera a disponibilidade global, gerando uma média coerente e precisa.
- Execução de `tsc --noEmit` e `compile_applet`.
