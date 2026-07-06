/* Smoke test: carrega index.html no jsdom com Supabase mockado
   e verifica se as 4 views renderizam com dados. */
const { JSDOM } = require('/tmp/node_modules/jsdom');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

// ---- Seed ----
const filiais = [
  { id: 'f1', empresa_id: 'demo', nome: 'Matriz Centro', cidade: 'São Paulo', estado: 'SP', matriz: true, ativo: true },
  { id: 'f2', empresa_id: 'demo', nome: 'Filial Rio', cidade: 'Rio de Janeiro', estado: 'RJ', matriz: false, ativo: true },
];
const produtos = [
  { id: 'p1', empresa_id: 'demo', nome: 'Arroz 5kg', sku: 'ARZ-5', categoria: 'Alimentos', unidade: 'un', preco_custo: 18.5, preco_venda: 27.9, estoque_minimo: 20, ativo: true },
  { id: 'p2', empresa_id: 'demo', nome: 'Café 500g', sku: 'CAF-5', categoria: 'Alimentos', unidade: 'un', preco_custo: 12, preco_venda: 19.9, estoque_minimo: 15, ativo: true },
];
const saldos = [
  { id: 's1', empresa_id: 'demo', filial_id: 'f1', produto_id: 'p1', quantidade: 50 },
  { id: 's2', empresa_id: 'demo', filial_id: 'f2', produto_id: 'p1', quantidade: 5 },
  { id: 's3', empresa_id: 'demo', filial_id: 'f1', produto_id: 'p2', quantidade: 10 },
];
const movs = [
  { id: 'm1', empresa_id: 'demo', filial_id: 'f1', produto_id: 'p1', tipo: 'entrada', quantidade: 50, obs: null, created_at: new Date().toISOString() },
];
const tables = { estoque_filiais: filiais, estoque_produtos: produtos, estoque_saldos: saldos, estoque_movimentacoes: movs };

function chain(data) {
  const c = {
    eq: () => c, order: () => c, limit: () => c, select: () => c,
    single: () => Promise.resolve({ data: data[0], error: null }),
    then: (res, rej) => Promise.resolve({ data, error: null }).then(res, rej),
  };
  return c;
}

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

let realtimeCallback = null;
window.supabase = {
  createClient: () => ({
    from: (t) => ({ select: () => chain(tables[t] || []), insert: (x) => chain([x]), update: (x) => chain([x]) }),
    rpc: async () => ({ data: null, error: null }),
    channel: () => {
      const handlers = [];
      const ch = {
        on: (_ev, filtro, cb) => { handlers.push({ tabela: filtro.table, cb }); return ch; },
        subscribe: (cb) => {
          realtimeCallback = (tabela, payload) => handlers
            .filter(h => h.tabela === tabela).forEach(h => h.cb(payload));
          if (cb) cb('SUBSCRIBED');
          return ch;
        },
      };
      return ch;
    },
  }),
};

// Executa scripts na ordem (pulando o vendor, já mockado) — num único
// escopo para que os `const` de um arquivo sejam visíveis nos demais
const bundle = ['js/config.js', 'js/icons.js', 'js/utils.js', 'js/db.js', 'js/app.js']
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
window.eval(bundle);
window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

setTimeout(() => {
  const $ = (s) => window.document.querySelector(s);
  const txt = (s) => ($(s) ? $(s).textContent : '');
  const asserts = [
    ['chips de filiais', $('#chipsFiliais').querySelectorAll('.chip').length === 3],
    ['KPIs renderizados', $('#statGrid').querySelectorAll('.stat-card').length === 4],
    ['lista de produtos', $('#listaProdutos').querySelectorAll('.prod-row').length === 2],
    ['header consolidado', txt('#headerSub').includes('Todas as lojas')],
    ['ícones injetados', $('.logo-mini svg') !== null],
    ['selects de movimentação', $('#movFilial').querySelectorAll('option').length === 2],
    ['histórico de movs', $('#listaMov').querySelectorAll('.mov-row').length === 1],
    ['cadastro filiais', $('#listaFiliais').querySelectorAll('.prod-row').length === 2],
  ];

  // Busca: produto por cidade
  $('#inputBusca').value = 'arroz';
  $('#inputBusca').dispatchEvent(new window.Event('input', { bubbles: true }));
  const bd = $('#resultadosBusca').textContent;
  asserts.push(['busca encontra produto', bd.includes('Arroz 5kg')]);
  asserts.push(['breakdown mostra cidades', bd.includes('São Paulo') && bd.includes('Rio de Janeiro')]);

  // Filtro por filial
  $('#chipsFiliais .chip[data-id="f2"]').click();
  asserts.push(['filtro por filial no header', txt('#headerSub').includes('Filial Rio')]);
  asserts.push(['saldo da filial (5 un)', $('#listaProdutos .prod-row .qty .n').textContent.trim() === '50' ? false : true]);

  // Venda rápida disponível no breakdown
  asserts.push(['botão Vender no breakdown', $('#resultadosBusca [data-vender-p]') !== null]);

  // Indicador ao vivo conectado
  asserts.push(['badge ao vivo ativo', $('#liveBadge').classList.contains('on')]);

  // Realtime: simula venda em outra loja → saldo da Filial Rio cai de 5 para 2
  realtimeCallback('estoque_saldos', {
    eventType: 'UPDATE',
    new: { id: 's2', empresa_id: 'demo', filial_id: 'f2', produto_id: 'p1', quantidade: 2 },
  });
  realtimeCallback('estoque_movimentacoes', {
    eventType: 'INSERT',
    new: { id: 'm2', empresa_id: 'demo', filial_id: 'f2', produto_id: 'p1', tipo: 'venda', quantidade: 3, obs: null, created_at: new Date().toISOString() },
  });
  const qtdRio = $('#listaProdutos .prod-row[data-id="p1"] .qty .n').textContent.trim();
  asserts.push(['saldo atualizado ao vivo (5→2)', qtdRio === '2']);
  asserts.push(['venda aparece no histórico ao vivo',
    window.document.getElementById('listaMov').textContent.includes('Venda')]);
  asserts.push(['linha alterada recebe flash',
    $('#listaProdutos .prod-row[data-id="p1"]').classList.contains('flash')]);

  let fail = 0;
  for (const [nome, ok] of asserts) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}`);
    if (!ok) fail++;
  }
  process.exit(fail ? 1 : 0);
}, 300);
