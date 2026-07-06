/* =========================================================
   app.js — Gestor de Estoque Northn
   Visão consolidada ou por filial, busca de produto por
   loja/cidade, movimentações e cadastro.
   ========================================================= */

/* ---------- Ícones extras (mesmo estilo SF Symbols, traço 1.8) ---------- */
(() => {
  const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const wrap = (inner, o = {}) => {
    const size = o.size || 22;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${inner}</svg>`;
  };
  Icon.boxes = (o = {}) => wrap(`<path d="M12 3 4.5 6.5v11L12 21l7.5-3.5v-11Z" ${S}/><path d="M4.5 6.5 12 10l7.5-3.5" ${S}/><line x1="12" y1="10" x2="12" y2="21" ${S}/>`, o);
  Icon.refresh = (o = {}) => wrap(`<path d="M20 12a8 8 0 1 1-2.3-5.6" ${S}/><polyline points="20 3.5 20 8 15.5 8" ${S}/>`, o);
  Icon.swap = (o = {}) => wrap(`<polyline points="16 4 20 8 16 12" ${S}/><line x1="20" y1="8" x2="6" y2="8" ${S}/><polyline points="8 12.5 4 16.5 8 20.5" ${S}/><line x1="4" y1="16.5" x2="18" y2="16.5" ${S}/>`, o);
  Icon.arrowDown = (o = {}) => wrap(`<line x1="12" y1="4" x2="12" y2="20" ${S}/><polyline points="6 14 12 20 18 14" ${S}/>`, o);
  Icon.arrowUp = (o = {}) => wrap(`<line x1="12" y1="20" x2="12" y2="4" ${S}/><polyline points="6 10 12 4 18 10" ${S}/>`, o);
  Icon.slider = (o = {}) => wrap(`<line x1="4" y1="8" x2="20" y2="8" ${S}/><circle cx="9" cy="8" r="2.2" fill="#fff" ${S}/><line x1="4" y1="16" x2="20" y2="16" ${S}/><circle cx="15" cy="16" r="2.2" fill="#fff" ${S}/>`, o);
})();

const App = (() => {

  const state = {
    filiais: [],
    produtos: [],
    saldos: [],
    movs: [],
    filialSel: 'all',
    cidadeSel: 'all',
    busca: '',
    tipoMov: 'venda',
    sheetProdutoId: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtQtd = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  /* ================= Dados ================= */

  async function carregarTudo() {
    try {
      const [filiais, produtos, saldos, movs] = await Promise.all([
        DB.listarFiliais(), DB.listarProdutos(), DB.listarSaldos(), DB.listarMovimentacoes(),
      ]);
      Object.assign(state, { filiais, produtos, saldos, movs });
      renderTudo();
    } catch (e) {
      toast('Erro ao carregar dados', { icon: Icon.warning({ size: 16 }) });
    }
  }

  async function recarregarSaldos() {
    const [saldos, movs] = await Promise.all([DB.listarSaldos(), DB.listarMovimentacoes()]);
    Object.assign(state, { saldos, movs });
    renderTudo();
  }

  function saldo(produtoId, filialId = null) {
    return state.saldos
      .filter(s => s.produto_id === produtoId && (!filialId || s.filial_id === filialId))
      .reduce((acc, s) => acc + Number(s.quantidade), 0);
  }

  function filialPor(id) { return state.filiais.find(f => f.id === id); }
  function produtoPor(id) { return state.produtos.find(p => p.id === id); }
  function cidades() { return [...new Set(state.filiais.map(f => f.cidade))].sort(); }

  /* ================= Render ================= */

  function renderTudo() {
    renderChipsFiliais();
    renderStats();
    renderListaProdutos();
    renderChipsCidades();
    renderBusca();
    renderSelectsMov();
    renderMovs();
    renderCadastro();
    atualizarHeader();
  }

  function atualizarHeader() {
    const f = state.filialSel === 'all' ? null : filialPor(state.filialSel);
    $('#headerSub').textContent = f ? `${f.nome} · ${f.cidade}` : `Todas as lojas · ${state.filiais.length} filiais`;
  }

  function renderChipsFiliais() {
    const el = $('#chipsFiliais');
    el.innerHTML = `
      <button class="chip ${state.filialSel === 'all' ? 'active' : ''}" data-id="all">Todas</button>
      ${state.filiais.map(f => `
        <button class="chip ${state.filialSel === f.id ? 'active' : ''}" data-id="${f.id}">
          ${esc(f.nome)} <span class="cidade">· ${esc(f.cidade)}</span>
        </button>`).join('')}`;
    el.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
      state.filialSel = c.dataset.id;
      renderTudo();
    }));
  }

  function renderStats() {
    const fid = state.filialSel === 'all' ? null : state.filialSel;
    let unidades = 0, valor = 0, abaixo = 0;
    state.produtos.forEach(p => {
      const q = saldo(p.id, fid);
      unidades += q;
      valor += q * Number(p.preco_custo || 0);
      if (q <= Number(p.estoque_minimo)) abaixo++;
    });
    $('#statGrid').innerHTML = `
      <div class="stat-card fade-up"><div class="num">${state.produtos.length}</div><div class="lbl">Produtos</div></div>
      <div class="stat-card fade-up ${abaixo ? 'alerta' : ''}"><div class="num">${abaixo}</div><div class="lbl">Abaixo do mínimo</div></div>
      <div class="stat-card fade-up"><div class="num">${fmtQtd(unidades)}</div><div class="lbl">Unidades em estoque</div></div>
      <div class="stat-card fade-up"><div class="num">${formatMoeda(valor)}</div><div class="lbl">Valor em estoque (custo)</div></div>`;
  }

  function renderListaProdutos() {
    const fid = state.filialSel === 'all' ? null : state.filialSel;
    const el = $('#listaProdutos');
    if (!state.produtos.length) {
      el.innerHTML = `<div class="empty">${Icon.boxes({ size: 40 })}<p>Nenhum produto cadastrado</p></div>`;
      return;
    }
    el.innerHTML = state.produtos.map(p => {
      const q = saldo(p.id, fid);
      const baixo = q <= Number(p.estoque_minimo);
      return `
      <div class="prod-row ${baixo ? 'baixo' : ''}" data-id="${p.id}">
        <div class="ic-box">${Icon.boxes({ size: 22 })}</div>
        <div class="info">
          <h3>${esc(p.nome)}</h3>
          <p>${esc(p.sku || '—')} · ${esc(p.categoria || 'Sem categoria')}</p>
        </div>
        <div class="qty">
          <div class="n">${fmtQtd(q)}</div>
          <div class="u">${esc(p.unidade)}${baixo ? ' · baixo' : ''}</div>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('.prod-row').forEach(r =>
      r.addEventListener('click', () => abrirDetalheProduto(r.dataset.id)));
  }

  /* ---------- Detalhe: produto por filial/cidade ---------- */
  function breakdownHTML(p, filtroCidade = 'all') {
    const filiais = state.filiais.filter(f => filtroCidade === 'all' || f.cidade === filtroCidade);
    return `<div class="filial-breakdown">
      ${filiais.map(f => {
        const q = saldo(p.id, f.id);
        const baixo = q > 0 && q <= Number(p.estoque_minimo);
        return `
        <div class="fb-row ${q === 0 ? 'zero' : ''} ${baixo ? 'baixo' : ''}" data-fb="${p.id}:${f.id}">
          <div class="loc">
            ${Icon.pin({ size: 15 })}
            <span class="nome">${esc(f.nome)}</span>
            <span class="cid">${esc(f.cidade)}${f.estado ? ' · ' + esc(f.estado) : ''}</span>
          </div>
          <span class="flex items-center">
            <span class="q">${fmtQtd(q)} ${esc(p.unidade)}</span>
            ${q > 0 ? `<button class="btn-vender" data-vender-p="${p.id}" data-vender-f="${f.id}">Vender</button>` : ''}
          </span>
        </div>`;
      }).join('')}
    </div>`;
  }

  /* ---------- Venda rápida por loja ---------- */
  function formVenda(produtoId, filialId) {
    const p = produtoPor(produtoId);
    const f = filialPor(filialId);
    if (!p || !f) return;
    const disponivel = saldo(p.id, f.id);
    abrirSheet('Registrar venda', `
      <p class="text-soft" style="margin:0 0 14px; font-size:13.5px">
        <strong>${esc(p.nome)}</strong> — ${esc(f.nome)} (${esc(f.cidade)})<br>
        Disponível: <strong>${fmtQtd(disponivel)} ${esc(p.unidade)}</strong>
      </p>
      <div class="form-grid-2">
        <div class="field"><label>Quantidade vendida</label>
          <input type="number" id="fvQtd" min="0" step="any" value="1" max="${disponivel}"></div>
        <div class="field"><label>Observação</label><input type="text" id="fvObs" placeholder="Opcional"></div>
      </div>
      <button class="btn btn-primary btn-block" id="fvConfirmar" style="margin-top:16px">Confirmar venda</button>`);
    $('#fvConfirmar').addEventListener('click', async () => {
      const qtd = parseFloat($('#fvQtd').value);
      if (isNaN(qtd) || qtd <= 0) { toast('Informe a quantidade', { icon: Icon.warning({ size: 16 }) }); return; }
      if (qtd > disponivel) { toast('Quantidade maior que o disponível', { icon: Icon.warning({ size: 16 }) }); return; }
      $('#fvConfirmar').disabled = true;
      try {
        await DB.movimentar({ filial_id: f.id, produto_id: p.id, tipo: 'venda', quantidade: qtd, obs: $('#fvObs').value.trim() });
        fecharSheet();
        toast(`Venda registrada — ${esc(f.nome)}`);
        await recarregarSaldos();
      } catch (e) {
        toast('Erro ao registrar venda', { icon: Icon.warning({ size: 16 }) });
        $('#fvConfirmar').disabled = false;
      }
    });
  }

  function abrirDetalheProduto(id) {
    const p = produtoPor(id);
    if (!p) return;
    state.sheetProdutoId = id;
    abrirSheet(esc(p.nome), `
      <p class="text-soft" style="margin:0 0 14px; font-size:13px">
        ${esc(p.sku || '—')} · ${esc(p.categoria || 'Sem categoria')} ·
        mínimo ${fmtQtd(p.estoque_minimo)} ${esc(p.unidade)} ·
        total <strong>${fmtQtd(saldo(p.id))} ${esc(p.unidade)}</strong>
      </p>
      <div class="section-title" style="margin-top:0">Estoque por loja</div>
      ${breakdownHTML(p)}`);
  }

  /* ================= Busca ================= */

  function renderChipsCidades() {
    const el = $('#chipsCidades');
    el.innerHTML = `
      <button class="chip ${state.cidadeSel === 'all' ? 'active' : ''}" data-c="all">Todas as cidades</button>
      ${cidades().map(c => `
        <button class="chip ${state.cidadeSel === c ? 'active' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}`;
    el.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
      state.cidadeSel = c.dataset.c;
      renderChipsCidades();
      renderBusca();
    }));
  }

  function renderBusca() {
    const el = $('#resultadosBusca');
    const termo = state.busca.trim().toLowerCase();
    const achados = state.produtos.filter(p =>
      !termo || p.nome.toLowerCase().includes(termo) || (p.sku || '').toLowerCase().includes(termo));
    if (!achados.length) {
      el.innerHTML = `<div class="empty">${Icon.search404({ size: 40 })}<p>Nenhum produto encontrado</p></div>`;
      return;
    }
    el.innerHTML = achados.map(p => `
      <div class="prod-row" style="cursor:default; margin-bottom:4px">
        <div class="ic-box">${Icon.boxes({ size: 22 })}</div>
        <div class="info">
          <h3>${esc(p.nome)}</h3>
          <p>${esc(p.sku || '—')} · total ${fmtQtd(saldo(p.id))} ${esc(p.unidade)}</p>
        </div>
      </div>
      ${breakdownHTML(p, state.cidadeSel)}`).join('');
  }

  /* ================= Movimentar ================= */

  function renderSelectsMov() {
    const optsF = state.filiais.map(f =>
      `<option value="${f.id}">${esc(f.nome)} — ${esc(f.cidade)}</option>`).join('');
    $('#movFilial').innerHTML = optsF;
    $('#movDestino').innerHTML = optsF;
    $('#movProduto').innerHTML = state.produtos.map(p =>
      `<option value="${p.id}">${esc(p.nome)}${p.sku ? ' (' + esc(p.sku) + ')' : ''}</option>`).join('');
  }

  function setTipoMov(tipo) {
    state.tipoMov = tipo;
    document.querySelectorAll('#segTipo button').forEach(b =>
      b.classList.toggle('active', b.dataset.tipo === tipo));
    $('#wrapDestino').style.display = tipo === 'transferencia' ? '' : 'none';
    $('#lblFilial').textContent = tipo === 'transferencia' ? 'Filial de origem' : 'Filial';
    $('#lblQtd').textContent = tipo === 'ajuste' ? 'Quantidade final (contagem)' : 'Quantidade';
  }

  async function registrarMov() {
    const btn = $('#btnMovimentar');
    const filial_id = $('#movFilial').value;
    const produto_id = $('#movProduto').value;
    const quantidade = parseFloat($('#movQtd').value);
    const obs = $('#movObs').value.trim();
    if (!filial_id || !produto_id || isNaN(quantidade) || quantidade < 0) {
      toast('Preencha filial, produto e quantidade', { icon: Icon.warning({ size: 16 }) });
      return;
    }
    btn.disabled = true;
    try {
      if (state.tipoMov === 'transferencia') {
        const destino_id = $('#movDestino').value;
        if (destino_id === filial_id) {
          toast('Origem e destino iguais', { icon: Icon.warning({ size: 16 }) });
          return;
        }
        await DB.transferir({ origem_id: filial_id, destino_id, produto_id, quantidade, obs });
      } else {
        await DB.movimentar({ filial_id, produto_id, tipo: state.tipoMov, quantidade, obs });
      }
      $('#movQtd').value = '';
      $('#movObs').value = '';
      toast('Movimentação registrada');
      await recarregarSaldos();
    } catch (e) {
      toast('Erro ao registrar', { icon: Icon.warning({ size: 16 }) });
    } finally {
      btn.disabled = false;
    }
  }

  function renderMovs() {
    const el = $('#listaMov');
    if (!state.movs.length) {
      el.innerHTML = `<div class="empty">${Icon.clock({ size: 36 })}<p>Nenhuma movimentação ainda</p></div>`;
      return;
    }
    const meta = {
      entrada: { cls: 'entrada', ic: 'arrowDown', label: 'Entrada' },
      saida: { cls: 'saida', ic: 'arrowUp', label: 'Saída' },
      venda: { cls: 'saida', ic: 'cart', label: 'Venda' },
      ajuste: { cls: 'ajuste', ic: 'slider', label: 'Ajuste' },
      transferencia_saida: { cls: 'transf', ic: 'swap', label: 'Transf. saída' },
      transferencia_entrada: { cls: 'transf', ic: 'swap', label: 'Transf. entrada' },
    };
    el.innerHTML = state.movs.map(m => {
      const p = produtoPor(m.produto_id);
      const f = filialPor(m.filial_id);
      const t = meta[m.tipo] || meta.ajuste;
      const dt = new Date(m.created_at);
      return `
      <div class="mov-row">
        <div class="ic ${t.cls}">${Icon[t.ic]({ size: 17 })}</div>
        <div class="info">
          <div class="t">${t.label} · ${fmtQtd(m.quantidade)} ${esc(p ? p.unidade : '')}</div>
          <div class="s">${esc(p ? p.nome : 'Produto removido')} — ${esc(f ? `${f.nome} (${f.cidade})` : 'Filial removida')}${m.obs ? ' · ' + esc(m.obs) : ''}</div>
        </div>
        <div class="when">${dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>`;
    }).join('');
  }

  /* ================= Cadastro ================= */

  function renderCadastro() {
    $('#listaFiliais').innerHTML = state.filiais.map(f => `
      <div class="prod-row" data-fid="${f.id}">
        <div class="ic-box">${Icon.store({ size: 20 })}</div>
        <div class="info">
          <h3>${esc(f.nome)}${f.matriz ? ' · Matriz' : ''}</h3>
          <p>${esc(f.cidade)}${f.estado ? ' · ' + esc(f.estado) : ''}${f.endereco ? ' · ' + esc(f.endereco) : ''}</p>
        </div>
        ${Icon.chevronRight({ size: 18 })}
      </div>`).join('') || `<div class="empty"><p>Nenhuma filial</p></div>`;
    document.querySelectorAll('#listaFiliais .prod-row').forEach(r =>
      r.addEventListener('click', () => formFilial(r.dataset.fid)));

    $('#listaProdutosCad').innerHTML = state.produtos.map(p => `
      <div class="prod-row" data-pid="${p.id}">
        <div class="ic-box">${Icon.boxes({ size: 20 })}</div>
        <div class="info">
          <h3>${esc(p.nome)}</h3>
          <p>${esc(p.sku || '—')} · custo ${formatMoeda(Number(p.preco_custo || 0))} · venda ${formatMoeda(Number(p.preco_venda || 0))}</p>
        </div>
        ${Icon.chevronRight({ size: 18 })}
      </div>`).join('') || `<div class="empty"><p>Nenhum produto</p></div>`;
    document.querySelectorAll('#listaProdutosCad .prod-row').forEach(r =>
      r.addEventListener('click', () => formProduto(r.dataset.pid)));
  }

  function formFilial(id = null) {
    const f = id ? filialPor(id) : {};
    abrirSheet(id ? 'Editar filial' : 'Nova filial', `
      <div class="field" style="margin-bottom:12px"><label>Nome</label><input id="ffNome" value="${esc(f.nome || '')}"></div>
      <div class="form-grid-2">
        <div class="field"><label>Cidade</label><input id="ffCidade" value="${esc(f.cidade || '')}"></div>
        <div class="field"><label>Estado (UF)</label><input id="ffEstado" maxlength="2" value="${esc(f.estado || '')}"></div>
      </div>
      <div class="field" style="margin:12px 0"><label>Endereço</label><input id="ffEnd" value="${esc(f.endereco || '')}"></div>
      <label class="flex items-center gap-8" style="font-size:14px; font-weight:600; margin-bottom:16px">
        <input type="checkbox" id="ffMatriz" ${f.matriz ? 'checked' : ''}> É a matriz
      </label>
      <button class="btn btn-primary btn-block" id="ffSalvar">Salvar</button>`);
    $('#ffSalvar').addEventListener('click', async () => {
      const nome = $('#ffNome').value.trim();
      const cidade = $('#ffCidade').value.trim();
      if (!nome || !cidade) { toast('Nome e cidade são obrigatórios', { icon: Icon.warning({ size: 16 }) }); return; }
      try {
        await DB.salvarFilial({
          id: id || undefined, nome, cidade,
          estado: $('#ffEstado').value.trim().toUpperCase() || null,
          endereco: $('#ffEnd').value.trim() || null,
          matriz: $('#ffMatriz').checked,
        });
        fecharSheet();
        toast('Filial salva');
        state.filiais = await DB.listarFiliais();
        renderTudo();
      } catch (e) { toast('Erro ao salvar', { icon: Icon.warning({ size: 16 }) }); }
    });
  }

  function formProduto(id = null) {
    const p = id ? produtoPor(id) : {};
    abrirSheet(id ? 'Editar produto' : 'Novo produto', `
      <div class="field" style="margin-bottom:12px"><label>Nome</label><input id="fpNome" value="${esc(p.nome || '')}"></div>
      <div class="form-grid-2">
        <div class="field"><label>SKU</label><input id="fpSku" value="${esc(p.sku || '')}"></div>
        <div class="field"><label>Categoria</label><input id="fpCat" value="${esc(p.categoria || '')}"></div>
      </div>
      <div class="form-grid-2" style="margin-top:12px">
        <div class="field"><label>Unidade</label><input id="fpUn" value="${esc(p.unidade || 'un')}"></div>
        <div class="field"><label>Estoque mínimo</label><input type="number" id="fpMin" min="0" step="any" value="${p.estoque_minimo ?? 0}"></div>
      </div>
      <div class="form-grid-2" style="margin-top:12px">
        <div class="field"><label>Preço de custo (R$)</label><input type="number" id="fpCusto" min="0" step="0.01" value="${p.preco_custo ?? ''}"></div>
        <div class="field"><label>Preço de venda (R$)</label><input type="number" id="fpVenda" min="0" step="0.01" value="${p.preco_venda ?? ''}"></div>
      </div>
      <button class="btn btn-primary btn-block" id="fpSalvar" style="margin-top:16px">Salvar</button>`);
    $('#fpSalvar').addEventListener('click', async () => {
      const nome = $('#fpNome').value.trim();
      if (!nome) { toast('Nome é obrigatório', { icon: Icon.warning({ size: 16 }) }); return; }
      try {
        await DB.salvarProduto({
          id: id || undefined, nome,
          sku: $('#fpSku').value.trim() || null,
          categoria: $('#fpCat').value.trim() || null,
          unidade: $('#fpUn').value.trim() || 'un',
          estoque_minimo: parseFloat($('#fpMin').value) || 0,
          preco_custo: parseFloat($('#fpCusto').value) || 0,
          preco_venda: parseFloat($('#fpVenda').value) || 0,
        });
        fecharSheet();
        toast('Produto salvo');
        state.produtos = await DB.listarProdutos();
        renderTudo();
      } catch (e) { toast('Erro ao salvar', { icon: Icon.warning({ size: 16 }) }); }
    });
  }

  /* ================= Sheet ================= */

  function abrirSheet(titulo, html) {
    $('#sheetTitle').textContent = titulo;
    $('#sheetBody').innerHTML = html;
    $('#sheet').classList.add('open');
    $('#sheetOverlay').classList.add('open');
  }
  function fecharSheet() {
    state.sheetProdutoId = null;
    $('#sheet').classList.remove('open');
    $('#sheetOverlay').classList.remove('open');
  }

  /* ================= Tempo real ================= */

  const flashPend = new Map(); // key -> timestamp (mantém o destaque por ~1.5s entre re-renders)

  function renderAoVivo() {
    renderStats();
    renderListaProdutos();
    renderBusca();
    renderMovs();
    // Sheet de detalhe aberto? Atualiza o breakdown ao vivo
    if (state.sheetProdutoId && $('#sheet').classList.contains('open')) {
      const p = produtoPor(state.sheetProdutoId);
      if (p) {
        const bd = $('#sheetBody .filial-breakdown');
        if (bd) bd.outerHTML = breakdownHTML(p);
      }
    }
    // Destaca linhas alteradas (mantém por 1,5s mesmo com re-renders seguidos)
    const agora = Date.now();
    flashPend.forEach((ts, key) => {
      if (agora - ts > 1500) { flashPend.delete(key); return; }
      document.querySelectorAll(`[data-fb="${key}"]`).forEach(el => el.classList.add('flash'));
      const [pid] = key.split(':');
      document.querySelectorAll(`.prod-row[data-id="${pid}"]`).forEach(el => el.classList.add('flash'));
    });
  }

  function iniciarTempoReal() {
    if (!DB.aoVivo) return;
    try {
      DB.aoVivo((tipo, payload) => {
        const row = payload.new;
        if (!row || row.empresa_id !== EMPRESA_ID) return;
        if (tipo === 'saldo') {
          const i = state.saldos.findIndex(s => s.id === row.id);
          if (i >= 0) state.saldos[i] = row; else state.saldos.push(row);
          flashPend.set(`${row.produto_id}:${row.filial_id}`, Date.now());
        } else {
          if (!state.movs.some(m => m.id === row.id)) {
            state.movs.unshift(row);
            state.movs = state.movs.slice(0, 30);
          }
        }
        renderAoVivo();
      }, (conectado) => {
        $('#liveBadge').classList.toggle('on', conectado);
      });
    } catch (e) {
      console.warn('Tempo real indisponível', e);
    }
  }

  /* ================= Navegação / init ================= */

  function trocarView(nome) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${nome}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b =>
      b.classList.toggle('active', b.dataset.view === nome));
  }

  function init() {
    document.querySelectorAll('.nav-item').forEach(b =>
      b.addEventListener('click', () => trocarView(b.dataset.view)));
    $('#inputBusca').addEventListener('input', (e) => { state.busca = e.target.value; renderBusca(); });
    document.querySelectorAll('#segTipo button').forEach(b =>
      b.addEventListener('click', () => setTipoMov(b.dataset.tipo)));
    $('#btnMovimentar').addEventListener('click', registrarMov);
    $('#btnRefresh').addEventListener('click', carregarTudo);
    $('#btnNovaFilial').addEventListener('click', () => formFilial());
    $('#btnNovoProduto').addEventListener('click', () => formProduto());
    $('#sheetClose').addEventListener('click', fecharSheet);
    $('#sheetOverlay').addEventListener('click', fecharSheet);
    // Venda rápida (delegação: botões dentro de listas re-renderizadas)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-vender-p]');
      if (btn) {
        e.stopPropagation();
        formVenda(btn.dataset.venderP, btn.dataset.venderF);
      }
    });
    setTipoMov(state.tipoMov);
    carregarTudo();
    iniciarTempoReal();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { carregarTudo };
})();
