create extension if not exists pgcrypto;

create table if not exists stores (
  id text primary key,
  name text not null,
  domain text not null unique,
  shopify_shop_id text unique,
  currency text not null,
  timezone text not null,
  plan_name text,
  connected boolean not null default false,
  date_range_preset text not null default '30d',
  estimated_cost_mode text not null default 'margin_profile',
  default_cost_ratio numeric(5,4) not null default 0.35,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shopify_connections (
  id text primary key,
  store_id text not null unique references stores(id) on delete cascade,
  shop_domain text not null,
  admin_access_token_enc text not null,
  token_last_four text not null,
  api_version text not null default '2025-01',
  last_sync_at timestamptz,
  last_products_sync_at timestamptz,
  last_customers_sync_at timestamptz,
  last_orders_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  sync_status text not null default 'idle',
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sync_runs (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  mode text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  sync_from timestamptz,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_failed integer not null default 0,
  error_message text,
  details_json jsonb
);

create table if not exists products (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  shopify_product_id text not null,
  title text not null,
  handle text not null,
  vendor text,
  product_type text,
  status text,
  collection text not null,
  price numeric(10,2) not null default 0,
  estimated_cost numeric(10,2) not null default 0,
  cost_override_amount numeric(10,2),
  margin_profile text not null default 'core',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(store_id, shopify_product_id)
);

create table if not exists product_variants (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  shopify_variant_id text not null,
  sku text,
  title text not null,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  inventory_quantity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, shopify_variant_id)
);

create table if not exists customers (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  shopify_customer_id text not null,
  email text,
  first_name text,
  last_name text,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  first_order_date timestamptz,
  total_orders integer not null default 0,
  lifetime_value numeric(12,2) not null default 0,
  is_returning boolean not null default false,
  unique(store_id, shopify_customer_id)
);

create table if not exists orders (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  shopify_order_id text not null,
  order_number text not null,
  display_name text,
  created_at timestamptz not null,
  processed_at timestamptz,
  currency text not null,
  subtotal_price numeric(12,2) not null default 0,
  total_discounts numeric(12,2) not null default 0,
  total_tax numeric(12,2) not null default 0,
  total_shipping numeric(12,2) not null default 0,
  total_refunds numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  financial_status text,
  fulfillment_status text,
  source_name text,
  updated_at timestamptz not null,
  unique(store_id, shopify_order_id)
);

create table if not exists order_line_items (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  order_id text not null references orders(id) on delete cascade,
  product_id text references products(id) on delete set null,
  variant_id text references product_variants(id) on delete set null,
  shopify_line_item_id text,
  title text not null,
  quantity integer not null,
  original_unit_price numeric(10,2) not null default 0,
  discounted_unit_price numeric(10,2) not null default 0,
  line_subtotal numeric(12,2) not null default 0,
  line_discount_amount numeric(12,2) not null default 0,
  estimated_cost_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, order_id, shopify_line_item_id)
);

create table if not exists discount_usages (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  order_id text not null references orders(id) on delete cascade,
  code text not null,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, order_id, code)
);

create table if not exists refunds (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  order_id text not null references orders(id) on delete cascade,
  shopify_refund_id text,
  refunded_amount numeric(12,2) not null default 0,
  refunded_line_items_amount numeric(12,2) not null default 0,
  created_at timestamptz not null,
  unique(store_id, shopify_refund_id)
);

create table if not exists daily_metrics (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  date timestamptz not null,
  revenue numeric(12,2) not null default 0,
  estimated_profit numeric(12,2) not null default 0,
  returning_customer_rate numeric(7,4) not null default 0,
  average_order_value numeric(12,2) not null default 0,
  discount_rate numeric(7,4) not null default 0,
  refund_rate numeric(7,4) not null default 0,
  orders_count integer not null default 0,
  new_customers integer not null default 0,
  returning_customers integer not null default 0,
  unique(store_id, date)
);

create table if not exists summaries (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  headline text not null,
  content_json jsonb not null,
  generated_at timestamptz not null
);

create table if not exists alerts (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  severity text not null,
  title text not null,
  explanation text not null,
  suggested_action text not null,
  period_label text not null,
  timestamp timestamptz not null
);

create table if not exists instagram_connections (
  id text primary key,
  store_id text not null unique references stores(id) on delete cascade,
  instagram_user_id text not null,
  username text,
  access_token_enc text not null,
  token_last_four text not null,
  sync_status text not null default 'idle',
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists creator_profiles (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  platform text not null,
  external_id text not null,
  username text not null,
  display_name text,
  profile_url text,
  affiliate_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, platform, external_id)
);

create table if not exists creator_posts (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  instagram_connection_id text references instagram_connections(id) on delete set null,
  creator_profile_id text references creator_profiles(id) on delete set null,
  external_post_id text not null,
  caption text,
  media_type text,
  media_url text,
  permalink text,
  posted_at timestamptz not null,
  like_count integer not null default 0,
  comments_count integer not null default 0,
  view_count integer not null default 0,
  attributed_sales numeric(12,2) not null default 0,
  attributed_orders integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, external_post_id)
);

create table if not exists creator_attributions (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  creator_profile_id text references creator_profiles(id) on delete set null,
  creator_post_id text references creator_posts(id) on delete set null,
  order_id text references orders(id) on delete set null,
  source_platform text not null,
  affiliate_code text,
  sales_amount numeric(12,2) not null default 0,
  orders_count integer not null default 0,
  clicks integer not null default 0,
  commission_amount numeric(12,2) not null default 0,
  period_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists affiliate_programs (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  commission_rate numeric(5,4) not null default 0.10,
  sign_up_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists affiliate_members (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  program_id text references affiliate_programs(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  status text not null default 'pending',
  source text,
  country text,
  affiliate_code text not null unique,
  coupon_code text,
  referral_link text,
  short_link text,
  clicks_total integer not null default 0,
  orders_total integer not null default 0,
  sales_total numeric(12,2) not null default 0,
  commission_total numeric(12,2) not null default 0,
  approved_balance numeric(12,2) not null default 0,
  joined_at timestamptz not null default now(),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, email)
);

create table if not exists affiliate_coupons (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  affiliate_member_id text references affiliate_members(id) on delete set null,
  shopify_discount_id text,
  title text not null,
  code text not null,
  discount_type text not null,
  discount_value numeric(12,2) not null,
  applies_once_per_customer boolean not null default true,
  apply_link text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, code)
);

create table if not exists attribution_sessions (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  affiliate_member_id text references affiliate_members(id) on delete set null,
  click_id text not null unique,
  visitor_token text,
  source_platform text,
  source_url text,
  destination_url text not null,
  landing_path text,
  coupon_code text,
  affiliate_code text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ip_hash text,
  user_agent text,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists affiliate_attributions (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  affiliate_member_id text not null references affiliate_members(id) on delete cascade,
  order_id text references orders(id) on delete set null,
  attribution_session_id text references attribution_sessions(id) on delete set null,
  source_type text not null default 'coupon',
  tracking_method text,
  source_url text,
  content_title text,
  sales_amount numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  clicks integer not null default 0,
  orders_count integer not null default 1,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(affiliate_member_id, order_id)
);

create table if not exists agent_settings (
  id text primary key,
  store_id text not null unique references stores(id) on delete cascade,
  enabled boolean not null default true,
  mode text not null default 'recommendation_only',
  check_frequency_minutes integer not null default 60,
  thresholds jsonb not null,
  comparison_windows jsonb not null,
  channels jsonb not null,
  notifications jsonb not null,
  guardrails jsonb not null,
  allowed_actions jsonb not null,
  approval_rules jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_findings (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  finding_type text not null,
  severity text not null,
  metric_name text not null,
  summary text not null,
  possible_causes jsonb not null,
  recommended_actions jsonb not null,
  confidence_score numeric(4,2) not null default 0.65,
  source_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_actions (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  action_type text not null,
  status text not null,
  title text not null,
  reason text not null,
  payload jsonb not null,
  estimated_impact jsonb,
  risk_level text not null,
  confidence_score numeric(4,2) not null default 0.65,
  approval_required boolean not null default false,
  approved_by text,
  dry_run boolean not null default false,
  executed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_connections (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  platform text not null,
  status text not null default 'not_connected',
  config jsonb,
  token_last_four text,
  health_message text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, platform)
);

create table if not exists metric_snapshots (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  source text not null,
  bucketed_at timestamptz not null,
  metrics jsonb not null,
  confidence_score numeric(4,2),
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  platform text not null,
  topic text not null,
  external_id text,
  status text not null default 'received',
  payload jsonb not null,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sync_runs_store_started_at on sync_runs(store_id, started_at desc);
create index if not exists idx_orders_store_created_at on orders(store_id, created_at);
create index if not exists idx_daily_metrics_store_date on daily_metrics(store_id, date);
create index if not exists idx_affiliate_members_store_status on affiliate_members(store_id, status);
create index if not exists idx_attribution_sessions_store_created_at on attribution_sessions(store_id, created_at desc);
create index if not exists idx_affiliate_attributions_store_occurred_at on affiliate_attributions(store_id, occurred_at desc);
create index if not exists idx_agent_findings_store_created_at on agent_findings(store_id, created_at desc);
create index if not exists idx_agent_actions_store_created_at on agent_actions(store_id, created_at desc);
create index if not exists idx_platform_connections_store_status on platform_connections(store_id, status);
create index if not exists idx_metric_snapshots_store_bucketed_at on metric_snapshots(store_id, bucketed_at desc);
create index if not exists idx_webhook_events_store_topic_created_at on webhook_events(store_id, topic, created_at desc);
