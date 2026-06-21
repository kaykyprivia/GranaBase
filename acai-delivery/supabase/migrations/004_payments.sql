-- Rastreio de pagamento Mercado Pago
alter table orders
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text;
