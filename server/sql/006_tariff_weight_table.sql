-- Additive tariff weight-rate table persistence for production-safe rollout.

alter table tariffs add column if not exists currency text not null default 'KD';
alter table tariffs add column if not exists weight_rates_json text not null default '{}';

update tariffs
set weight_rates_json = json_build_object(
    'minimum', rate,
    'upTo100', rate,
    'upTo300', rate,
    'upTo500', rate,
    'upTo1000', rate,
    'more', rate
)::text
where coalesce(nullif(weight_rates_json, ''), '{}') = '{}'
  and rate is not null;
