# Zabbix Report Analyzer

Painel para analisar planilhas de eventos do Zabbix no navegador.

## Funcionalidades

- Importação de planilhas de eventos, com filtros, gráficos interativos e indicadores de MTTR.
- Análise de tendências, resumo executivo e exportação de relatórios em PDF e apresentações PowerPoint.
- Integração opcional com DeepSeek, configurada na interface.

## Executar localmente

Node.js e npm.

Na raiz do projeto, execute:

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite e importe uma planilha `.xlsx` de eventos do Zabbix. Para executar com Docker, use `docker compose up --build` e acesse `http://localhost:8080`.

## Comandos

- `npm run lint` — Verifica os tipos do TypeScript.
- `npm run build` — Gera a versão de distribuição.
- `npm run preview` — Pré-visualiza o build do Vite.

## Arquivos de referência

- [Leitura e normalização de eventos](src/utils/parser.ts)
- [Cálculo de indicadores](src/utils/analytics.ts)
- [Configuração do Docker Compose](docker-compose.yml)
