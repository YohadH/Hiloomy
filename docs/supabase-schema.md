# Supabase Schema Reference

This document mirrors the app data model so the same entities can be created in Supabase/Postgres.

## Core commerce tables

### stores
- id: text primary key
- name: text
- domain: text unique
- shopify_shop_id: text unique nullable
- currency: text
- timezone: text
- plan_name: text nullable
- connected: boolean
- date_range_preset: text
- estimated_cost_mode: text
- default_cost_ratio: numeric(5,4)
- created_at: timestamptz
- updated_at: timestamptz

### shopify_connections
- id: text primary key
- store_id: text unique references stores(id)
- shop_domain: text
- admin_access_token_enc: text
- token_last_four: text
- api_version: text
- last_sync_at: timestamptz nullable
- last_products_sync_at: timestamptz nullable
- last_customers_sync_at: timestamptz nullable
- last_orders_sync_at: timestamptz nullable
- last_successful_sync_at: timestamptz nullable
- sync_status: text
- last_sync_error: text nullable
- created_at: timestamptz
- updated_at: timestamptz

### sync_runs
- id: text primary key
- store_id: text references stores(id)
- mode: text
- status: text
- started_at: timestamptz
- completed_at: timestamptz nullable
- sync_from: timestamptz nullable
- records_created: integer
- records_updated: integer
- records_failed: integer
- error_message: text nullable
- details_json: jsonb nullable

### products
- id: text primary key
- store_id: text references stores(id)
- shopify_product_id: text
- title: text
- handle: text
- vendor: text nullable
- product_type: text nullable
- status: text nullable
- collection: text
- price: numeric(10,2)
- estimated_cost: numeric(10,2)
- cost_override_amount: numeric(10,2) nullable
- margin_profile: text
- created_at: timestamptz
- updated_at: timestamptz

### product_variants
- id: text primary key
- store_id: text references stores(id)
- product_id: text references products(id)
- shopify_variant_id: text
- sku: text nullable
- title: text
- price: numeric(10,2) nullable
- compare_at_price: numeric(10,2) nullable
- inventory_quantity: integer nullable
- created_at: timestamptz
- updated_at: timestamptz

### customers
- id: text primary key
- store_id: text references stores(id)
- shopify_customer_id: text
- email: text nullable
- first_name: text nullable
- last_name: text nullable
- name: text
- created_at: timestamptz
- updated_at: timestamptz
- first_order_date: timestamptz nullable
- total_orders: integer
- lifetime_value: numeric(12,2)
- is_returning: boolean

### orders
- id: text primary key
- store_id: text references stores(id)
- customer_id: text nullable references customers(id)
- shopify_order_id: text
- order_number: text
- display_name: text nullable
- created_at: timestamptz
- processed_at: timestamptz nullable
- currency: text
- subtotal_price: numeric(12,2)
- total_discounts: numeric(12,2)
- total_tax: numeric(12,2)
- total_shipping: numeric(12,2)
- total_refunds: numeric(12,2)
- total_price: numeric(12,2)
- financial_status: text nullable
- fulfillment_status: text nullable
- source_name: text nullable
- updated_at: timestamptz

### order_line_items
- id: text primary key
- store_id: text references stores(id)
- order_id: text references orders(id)
- product_id: text nullable references products(id)
- variant_id: text nullable references product_variants(id)
- shopify_line_item_id: text nullable
- title: text
- quantity: integer
- original_unit_price: numeric(10,2)
- discounted_unit_price: numeric(10,2)
- line_subtotal: numeric(12,2)
- line_discount_amount: numeric(12,2)
- estimated_cost_amount: numeric(12,2)
- created_at: timestamptz
- updated_at: timestamptz

### discount_usages
- id: text primary key
- store_id: text references stores(id)
- order_id: text references orders(id)
- code: text
- amount: numeric(12,2)
- created_at: timestamptz
- updated_at: timestamptz

### refunds
- id: text primary key
- store_id: text references stores(id)
- order_id: text references orders(id)
- shopify_refund_id: text nullable
- refunded_amount: numeric(12,2)
- refunded_line_items_amount: numeric(12,2)
- created_at: timestamptz

### daily_metrics
- id: text primary key
- store_id: text references stores(id)
- date: timestamptz
- revenue: numeric(12,2)
- estimated_profit: numeric(12,2)
- returning_customer_rate: numeric(7,4)
- average_order_value: numeric(12,2)
- discount_rate: numeric(7,4)
- refund_rate: numeric(7,4)
- orders_count: integer
- new_customers: integer
- returning_customers: integer

### summaries
- id: text primary key
- store_id: text references stores(id)
- headline: text
- content_json: jsonb
- generated_at: timestamptz

### alerts
- id: text primary key
- store_id: text references stores(id)
- severity: text
- title: text
- explanation: text
- suggested_action: text
- period_label: text
- timestamp: timestamptz

## Affiliate portal tables

### affiliate_programs
- id: text primary key
- store_id: text references stores(id)
- name: text
- status: text
- commission_rate: numeric(5,4)
- sign_up_link: text nullable
- created_at: timestamptz
- updated_at: timestamptz

### affiliate_members
- id: text primary key
- store_id: text references stores(id)
- program_id: text nullable references affiliate_programs(id)
- first_name: text
- last_name: text
- email: text
- status: text
- source: text nullable
- country: text nullable
- affiliate_code: text unique
- coupon_code: text nullable
- referral_link: text nullable
- short_link: text nullable
- clicks_total: integer
- orders_total: integer
- sales_total: numeric(12,2)
- commission_total: numeric(12,2)
- approved_balance: numeric(12,2)
- joined_at: timestamptz
- last_login_at: timestamptz nullable
- created_at: timestamptz
- updated_at: timestamptz

### affiliate_coupons
- id: text primary key
- store_id: text references stores(id)
- affiliate_member_id: text nullable references affiliate_members(id)
- shopify_discount_id: text nullable
- title: text
- code: text
- discount_type: text
- discount_value: numeric(12,2)
- applies_once_per_customer: boolean
- apply_link: text nullable
- status: text
- created_at: timestamptz
- updated_at: timestamptz

### attribution_sessions
- id: text primary key
- store_id: text references stores(id)
- affiliate_member_id: text nullable references affiliate_members(id)
- click_id: text unique
- visitor_token: text nullable
- source_platform: text nullable
- source_url: text nullable
- destination_url: text
- landing_path: text nullable
- coupon_code: text nullable
- affiliate_code: text nullable
- utm_source: text nullable
- utm_medium: text nullable
- utm_campaign: text nullable
- ip_hash: text nullable
- user_agent: text nullable
- converted_at: timestamptz nullable
- created_at: timestamptz
- updated_at: timestamptz

### affiliate_attributions
- id: text primary key
- store_id: text references stores(id)
- affiliate_member_id: text references affiliate_members(id)
- order_id: text nullable references orders(id)
- attribution_session_id: text nullable references attribution_sessions(id)
- source_type: text
- tracking_method: text nullable
- source_url: text nullable
- content_title: text nullable
- sales_amount: numeric(12,2)
- commission_amount: numeric(12,2)
- clicks: integer
- orders_count: integer
- occurred_at: timestamptz
- created_at: timestamptz
- updated_at: timestamptz

## Creator / social tables

### instagram_connections
- id: text primary key
- store_id: text unique references stores(id)
- instagram_user_id: text
- username: text nullable
- access_token_enc: text
- token_last_four: text
- sync_status: text
- last_sync_at: timestamptz nullable
- last_sync_error: text nullable
- created_at: timestamptz
- updated_at: timestamptz

### creator_profiles
- id: text primary key
- store_id: text references stores(id)
- platform: text
- external_id: text
- username: text
- display_name: text nullable
- profile_url: text nullable
- affiliate_code: text nullable
- created_at: timestamptz
- updated_at: timestamptz

### creator_posts
- id: text primary key
- store_id: text references stores(id)
- instagram_connection_id: text nullable references instagram_connections(id)
- creator_profile_id: text nullable references creator_profiles(id)
- external_post_id: text
- caption: text nullable
- media_type: text nullable
- media_url: text nullable
- permalink: text nullable
- posted_at: timestamptz
- like_count: integer
- comments_count: integer
- view_count: integer
- attributed_sales: numeric(12,2)
- attributed_orders: integer
- created_at: timestamptz
- updated_at: timestamptz

### creator_attributions
- id: text primary key
- store_id: text references stores(id)
- creator_profile_id: text nullable references creator_profiles(id)
- creator_post_id: text nullable references creator_posts(id)
- order_id: text nullable references orders(id)
- source_platform: text
- affiliate_code: text nullable
- sales_amount: numeric(12,2)
- orders_count: integer
- clicks: integer
- commission_amount: numeric(12,2)
- period_label: text nullable
- created_at: timestamptz
- updated_at: timestamptz

## Growth Agent tables

### agent_settings
- id: text primary key
- store_id: text unique references stores(id)
- enabled: boolean
- mode: text
- check_frequency_minutes: integer
- thresholds: jsonb
- comparison_windows: jsonb
- channels: jsonb
- notifications: jsonb
- guardrails: jsonb
- allowed_actions: jsonb
- approval_rules: jsonb
- created_at: timestamptz
- updated_at: timestamptz

### agent_findings
- id: text primary key
- store_id: text references stores(id)
- finding_type: text
- severity: text
- metric_name: text
- summary: text
- possible_causes: jsonb
- recommended_actions: jsonb
- confidence_score: numeric(4,2)
- source_data: jsonb nullable
- created_at: timestamptz

### agent_actions
- id: text primary key
- store_id: text references stores(id)
- action_type: text
- status: text
- title: text
- reason: text
- payload: jsonb
- estimated_impact: jsonb nullable
- risk_level: text
- confidence_score: numeric(4,2)
- approval_required: boolean
- approved_by: text nullable
- dry_run: boolean
- executed_at: timestamptz nullable
- failure_reason: text nullable
- created_at: timestamptz
- updated_at: timestamptz

### platform_connections
- id: text primary key
- store_id: text references stores(id)
- platform: text
- status: text
- config: jsonb nullable
- token_last_four: text nullable
- health_message: text nullable
- last_sync_at: timestamptz nullable
- created_at: timestamptz
- updated_at: timestamptz

### metric_snapshots
- id: text primary key
- store_id: text references stores(id)
- source: text
- bucketed_at: timestamptz
- metrics: jsonb
- confidence_score: numeric(4,2) nullable
- created_at: timestamptz

## Webhook audit table

### webhook_events
- id: text primary key
- store_id: text references stores(id)
- platform: text
- topic: text
- external_id: text nullable
- status: text
- payload: jsonb
- error_message: text nullable
- processed_at: timestamptz nullable
- created_at: timestamptz
- updated_at: timestamptz
