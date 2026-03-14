begin;

update public.store_settings
set
  value = 'SuCredito',
  description = 'Cards or financing brands not accepted.',
  updated_at = now()
where key = 'customer_cards_blocked';

update public.store_settings
set
  value = '6 cuotas fijas, solo presencial en Salta Capital. Naranja, Macro y otras bancarizadas están permitidas. SuCredito no.',
  description = 'High-level financing policy used by automation.',
  updated_at = now()
where key = 'store_financing_scope';

update public.store_settings
set
  value = '0.40',
  description = 'Interés cuotas Macro (40%)',
  updated_at = now()
where key = 'macro_interest';

update public.store_settings
set
  value = '0.40',
  description = 'Default Macro financing interest multiplier.',
  updated_at = now()
where key = 'pricing_macro_interest';

commit;
