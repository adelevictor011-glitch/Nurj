-- Nurj payment inbox agent, every 5 minutes.
--
-- Calls /api/cron/payment-inbox, which reads the Titan payments inbox
-- (read-only), confirms bank-alert matches and queues the rest for the admin
-- console. Uses the same nurj_cron_secret as the 07:30 daily job, so run
-- daily_job_0730_wat.sql first (or create the secret here the same way).
--
-- Before running: replace REPLACE_WITH_YOUR_DOMAIN. Safe to run more than once.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'nurj-payment-inbox') then
    perform cron.unschedule('nurj-payment-inbox');
  end if;
end
$$;

select cron.schedule(
  'nurj-payment-inbox',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://REPLACE_WITH_YOUR_DOMAIN/api/cron/payment-inbox',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nurj_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- Check it is scheduled:  select jobname, schedule, active from cron.job;
-- See recent runs:        select status, start_time, return_message from cron.job_run_details order by start_time desc limit 5;
