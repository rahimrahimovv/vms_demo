-- RFQ-10 (D-026): round the absolute value half-up, then apply the sign, so -3.25 gives -3.3 as 3.25 gives 3.3.
create or replace function app.round_half_up(p numeric, p_digits integer) returns numeric
language sql immutable set search_path = '' as $$
  select sign(p) * floor(abs(p) * power(10::numeric, p_digits) + 0.5) / power(10::numeric, p_digits)
$$;
