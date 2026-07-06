-- Schema do módulo de estoque (já aplicado ao projeto cardapio-digital via migração create_estoque_module)
-- Multi-tenant por empresa_id

create table if not exists estoque_filiais (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null default 'demo',
  nome text not null,
  cidade text not null,
  estado text,
  endereco text,
  matriz boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists estoque_produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null default 'demo',
  nome text not null,
  sku text,
  categoria text,
  unidade text not null default 'un',
  preco_custo numeric(12,2) default 0,
  preco_venda numeric(12,2) default 0,
  estoque_minimo numeric(12,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists estoque_saldos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null default 'demo',
  filial_id uuid not null references estoque_filiais(id) on delete cascade,
  produto_id uuid not null references estoque_produtos(id) on delete cascade,
  quantidade numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (filial_id, produto_id)
);

create table if not exists estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null default 'demo',
  filial_id uuid not null references estoque_filiais(id) on delete cascade,
  produto_id uuid not null references estoque_produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','saida','venda','ajuste','transferencia_saida','transferencia_entrada')),
  quantidade numeric(12,2) not null,
  obs text,
  created_at timestamptz not null default now()
);

create index if not exists idx_estoque_saldos_produto on estoque_saldos(produto_id);
create index if not exists idx_estoque_saldos_filial on estoque_saldos(filial_id);
create index if not exists idx_estoque_mov_filial on estoque_movimentacoes(filial_id, created_at desc);

create or replace function estoque_movimentar(
  p_empresa_id text,
  p_filial_id uuid,
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_obs text default null
) returns void
language plpgsql
security invoker
as $$
declare
  v_delta numeric;
begin
  if p_tipo in ('entrada','transferencia_entrada') then
    v_delta := p_quantidade;
  elsif p_tipo in ('saida','venda','transferencia_saida') then
    v_delta := -p_quantidade;
  elsif p_tipo = 'ajuste' then
    v_delta := null; -- ajuste define valor absoluto
  else
    raise exception 'tipo inválido: %', p_tipo;
  end if;

  insert into estoque_movimentacoes (empresa_id, filial_id, produto_id, tipo, quantidade, obs)
  values (p_empresa_id, p_filial_id, p_produto_id, p_tipo, p_quantidade, p_obs);

  insert into estoque_saldos (empresa_id, filial_id, produto_id, quantidade)
  values (p_empresa_id, p_filial_id, p_produto_id, coalesce(v_delta, p_quantidade))
  on conflict (filial_id, produto_id)
  do update set
    quantidade = case when v_delta is null then p_quantidade else estoque_saldos.quantidade + v_delta end,
    updated_at = now();
end;
$$;

-- RLS (padrão atual da suíte: aberto — migrar para RLS por usuário antes de clientes pagantes)
alter table estoque_filiais enable row level security;
alter table estoque_produtos enable row level security;
alter table estoque_saldos enable row level security;
alter table estoque_movimentacoes enable row level security;

create policy "open_filiais" on estoque_filiais for all using (true) with check (true);
create policy "open_produtos" on estoque_produtos for all using (true) with check (true);
create policy "open_saldos" on estoque_saldos for all using (true) with check (true);
create policy "open_mov" on estoque_movimentacoes for all using (true) with check (true);
