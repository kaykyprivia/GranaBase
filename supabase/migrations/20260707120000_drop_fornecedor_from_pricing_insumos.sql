-- O conceito de "fornecedor" foi removido do modulo de precificacao — o
-- produto trabalha apenas com Ingrediente / Quantidade / Unidade / Valor de
-- compra / Custo unitario, sem cadastro de fornecedores.
alter table public.pricing_insumos drop column if exists fornecedor;
