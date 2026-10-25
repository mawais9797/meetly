-- Run after deploying deliver-notifications. Replace values in the Vault UI,
-- not in committed SQL. Requires the pg_cron, pg_net and Vault extensions.
-- Vault secret names: appointment_project_url, appointment_cron_secret.
select cron.schedule('meetly-delivery-every-minute','* * * * *', $$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='appointment_project_url')||'/functions/v1/deliver-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='appointment_cron_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=55000
 );
$$);
