-- Nurj daily job at exactly 07:30 WAT (06:30 UTC; Nigeria has no daylight saving).
--
-- Vercel's free (Hobby) cron can fire anywhere within its hour, so Supabase's
-- scheduler (pg_cron, minute-accurate) calls the job instead. The Vercel cron
-- in vercel.json stays as a backup at 08:00-08:59 WAT; running twice is safe
-- because reminders and digests are each sent at most once.
--
-- Before running:
--   1. In Vercel, set CRON_SECRET to a long random string and redeploy.
--   2. In Supabase: Database -> Extensions -> enable pg_cron and pg_net.
--   3. Replace the two values marked REPLACE below, then run this file once
--      in the SQL editor.

-- Store the secret in Supabase Vault (encrypted), not in the job text.
select vault.create_secret('REPLACE_WITH_THE_SAME_CRON_SECRET', 'nurj_cron_secret');

-- Remove an older copy of the job if this file is run again.
select cron.unschedule(jobid) from cron.job where jobname = 'nurj-daily-0730-wat';

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
