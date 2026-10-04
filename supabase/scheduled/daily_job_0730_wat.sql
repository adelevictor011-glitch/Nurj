-- Nurj daily job at exactly 07:30 WAT (06:30 UTC; Nigeria has no daylight saving).
--
-- Vercel's free (Hobby) cron can fire anywhere within its hour, so Supabase's
-- scheduler (pg_cron, minute-accurate) calls the job instead. The Vercel cron
-- in vercel.json stays as a backup at 08:00-08:59 WAT; running twice is safe
-- because reminders and digests are each sent at most once.
--
-- Before running: set CRON_SECRET in Vercel, then replace the two values
-- marked REPLACE below. Safe to run more than once.

-- 1. Switch on the scheduler and the web-request extension.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 2. Store the secret in Supabase Vault (encrypted), creating or updating it.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'nurj_cron_secret') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'nurj_cron_secret'),
      'REPLACE_WITH_THE_SAME_CRON_SECRET'
    );
  else
    perform vault.create_secret('REPLACE_WITH_THE_SAME_CRON_SECRET', 'nurj_cron_secret');
  end if;
end
$$;

-- 3. Remove an older copy of the job, then schedule it for 06:30 UTC daily.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'nurj-daily-0730-wat') then
    perform cron.unschedule('nurj-daily-0730-wat');
  end if;
end
$$;

select cron.schedule(
  'nurj-daily-0730-wat',
  '30 6 * * *',
  $$
  select net.http_get(
    url := 'https://REPLACE_WITH_YOUR_DOMAIN/api/cron/expiry-reminders',
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
