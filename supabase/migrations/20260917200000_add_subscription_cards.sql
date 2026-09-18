alter table public.expenses
  add column if not exists currency text not null default 'EUR',
  add column if not exists card_color text;

alter table public.expenses
  drop constraint if exists expenses_currency_format;
alter table public.expenses
  add constraint expenses_currency_format check (currency ~ '^[A-Z]{3}$');
