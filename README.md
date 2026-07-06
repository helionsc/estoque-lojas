# Gestor de Estoque · Northn Software

Aplicação web para gestores acompanharem o estoque de suas lojas e filiais — separadas ou consolidadas — e localizarem produtos por loja e cidade.

## Funcionalidades

- **Visão geral**: KPIs (produtos, itens abaixo do mínimo, unidades e valor em estoque) com filtro por filial ou visão consolidada de todas as lojas
- **Buscar**: localizar um produto por nome ou SKU e ver em quais lojas/cidades ele está disponível, com filtro por cidade
- **Vendas**: baixa de estoque por venda, com botão de venda rápida por loja no detalhe de cada produto
- **Tempo real**: saldos e movimentações atualizam ao vivo (Supabase Realtime) em todos os dispositivos conectados — acompanhe loja por loja com destaque visual nas linhas alteradas e indicador "ao vivo" no topo
- **Movimentar**: registrar venda, entrada, saída, ajuste de inventário e transferência entre filiais, com histórico de movimentações
- **Cadastro**: gerenciar filiais (nome, cidade, UF, endereço, matriz) e produtos (SKU, categoria, unidade, preços, estoque mínimo)

## Stack

- Vanilla HTML/CSS/JavaScript — design system **Liquid Glass** (mesmo das demais apps Northn)
- Supabase (Postgres) — tabelas `estoque_filiais`, `estoque_produtos`, `estoque_saldos`, `estoque_movimentacoes` e função atômica `estoque_movimentar`
- Multi-tenant por `empresa_id` (configurado em `js/config.js`)
- supabase-js vendorizado em `js/vendor/supabase.js`

## Estrutura

```
index.html          SPA com 4 views (visão geral, buscar, movimentar, cadastro)
css/glass.css       Design system compartilhado
js/config.js        Credenciais Supabase + EMPRESA_ID
js/db.js            Camada de dados
js/app.js           Lógica de UI
js/icons.js         Ícones SVG estilo SF Symbols
js/utils.js         Helpers (toast, moeda, ripple)
js/vendor/          supabase-js local
supabase-schema.sql Schema completo do módulo
```

## Nota de segurança

As policies RLS estão abertas (`USING (true)`) seguindo o padrão atual da suíte — migrar para Supabase Auth com RLS por usuário antes de onboarding de clientes pagantes.
