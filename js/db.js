/* =========================================================
   db.js — Camada de dados do Gestor de Estoque
   Tabelas: estoque_filiais, estoque_produtos,
            estoque_saldos, estoque_movimentacoes
   ========================================================= */

const DB = (() => {

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function fail(error, contexto) {
    console.error(`DB error (${contexto})`, error);
    throw new Error(error.message || `Erro em ${contexto}`);
  }

  /* ---------- Filiais ---------- */
  async function listarFiliais() {
    const { data, error } = await supabaseClient
      .from('estoque_filiais')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('matriz', { ascending: false })
      .order('nome');
    if (error) fail(error, 'listarFiliais');
    return data;
  }

  async function salvarFilial(filial) {
    const payload = { ...filial, empresa_id: EMPRESA_ID };
    const { data, error } = payload.id
      ? await supabaseClient.from('estoque_filiais').update(payload).eq('id', payload.id).select().single()
      : await supabaseClient.from('estoque_filiais').insert(payload).select().single();
    if (error) fail(error, 'salvarFilial');
    return data;
  }

  /* ---------- Produtos ---------- */
  async function listarProdutos() {
    const { data, error } = await supabaseClient
      .from('estoque_produtos')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .eq('ativo', true)
      .order('nome');
    if (error) fail(error, 'listarProdutos');
    return data;
  }

  async function salvarProduto(produto) {
    const payload = { ...produto, empresa_id: EMPRESA_ID };
    const { data, error } = payload.id
      ? await supabaseClient.from('estoque_produtos').update(payload).eq('id', payload.id).select().single()
      : await supabaseClient.from('estoque_produtos').insert(payload).select().single();
    if (error) fail(error, 'salvarProduto');
    return data;
  }

  /* ---------- Saldos ---------- */
  async function listarSaldos() {
    const { data, error } = await supabaseClient
      .from('estoque_saldos')
      .select('*')
      .eq('empresa_id', EMPRESA_ID);
    if (error) fail(error, 'listarSaldos');
    return data;
  }

  /* ---------- Movimentações ---------- */
  async function movimentar({ filial_id, produto_id, tipo, quantidade, obs }) {
    const { error } = await supabaseClient.rpc('estoque_movimentar', {
      p_empresa_id: EMPRESA_ID,
      p_filial_id: filial_id,
      p_produto_id: produto_id,
      p_tipo: tipo,
      p_quantidade: quantidade,
      p_obs: obs || null,
    });
    if (error) fail(error, 'movimentar');
  }

  async function transferir({ origem_id, destino_id, produto_id, quantidade, obs }) {
    await movimentar({ filial_id: origem_id, produto_id, tipo: 'transferencia_saida', quantidade, obs });
    await movimentar({ filial_id: destino_id, produto_id, tipo: 'transferencia_entrada', quantidade, obs });
  }

  async function listarMovimentacoes(limite = 30) {
    const { data, error } = await supabaseClient
      .from('estoque_movimentacoes')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) fail(error, 'listarMovimentacoes');
    return data;
  }

  /* ---------- Tempo real ----------
     Assina INSERT/UPDATE em saldos e movimentações e notifica a UI.
     Assim, vendas registradas em qualquer dispositivo aparecem ao
     vivo para quem estiver acompanhando, loja por loja. */
  function aoVivo(callback, aoMudarStatus) {
    return supabaseClient
      .channel('estoque-live')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'estoque_saldos' },
        (payload) => callback('saldo', payload))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'estoque_movimentacoes' },
        (payload) => callback('movimentacao', payload))
      .subscribe((status) => {
        if (aoMudarStatus) aoMudarStatus(status === 'SUBSCRIBED');
      });
  }

  return {
    listarFiliais, salvarFilial,
    listarProdutos, salvarProduto,
    listarSaldos,
    movimentar, transferir, listarMovimentacoes,
    aoVivo,
  };
})();
