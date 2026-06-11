-- Correção da tabela dias_operacao para o SIMLUR Executivo
create table if not exists dias_operacao (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid,
  lote text,
  mes_referencia date,
  dias_operacao integer,
  ano integer,
  mes integer,
  mes_nome text,
  created_at timestamptz default now()
);

alter table dias_operacao add column if not exists importacao_id uuid;
alter table dias_operacao add column if not exists lote text;
alter table dias_operacao add column if not exists mes_referencia date;
alter table dias_operacao add column if not exists dias_operacao integer;
alter table dias_operacao add column if not exists ano integer;
alter table dias_operacao add column if not exists mes integer;
alter table dias_operacao add column if not exists mes_nome text;

notify pgrst, 'reload schema';
