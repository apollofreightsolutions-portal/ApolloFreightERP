do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'audit_log'
      and column_name = 'details'
      and data_type = 'jsonb'
  ) then
    alter table audit_log alter column details type text using (case when details = '{}'::jsonb then '' else details::text end);
  end if;
end $$;

alter table audit_log alter column details set default '';
alter table audit_log alter column details set not null;
