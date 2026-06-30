alter table public.companies add column if not exists chargebee_customer_id text;
alter table public.companies add column if not exists chargebee_subscription_id text;
alter table public.plans add column if not exists chargebee_price_id_monthly text;
alter table public.plans add column if not exists chargebee_price_id_annual text;

update public.plans set chargebee_price_id_monthly = 'Founders-Promotions-USD-Monthly', chargebee_price_id_annual = 'Founders-Promotions-USD-Yearly' where key = 'founding_500';
update public.plans set chargebee_price_id_monthly = 'Early-Birds-USD-Monthly',          chargebee_price_id_annual = 'Early-Birds-USD-Yearly'          where key = 'early_adopters';
update public.plans set chargebee_price_id_monthly = 'Sale-Price-USD-Monthly',           chargebee_price_id_annual = 'Sale-Price-USD-Yearly'           where key = 'intro_sale';
update public.plans set chargebee_price_id_monthly = 'Standard-USD-Monthly',             chargebee_price_id_annual = 'Standard-USD-Yearly'             where key = 'standard';
