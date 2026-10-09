# Enable GitHub sign-in for Watcher Parent Dashboard

This setup requires a GitHub OAuth application and a Supabase Authentication provider configuration. Never commit the OAuth client secret.

1. In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Application name: `Watcher Parent Dashboard`.
3. Homepage URL: `https://awemissions.github.io/Watcher-parent-child/`.
4. Authorization callback URL: `https://basnmfloksrslqinonaw.supabase.co/auth/v1/callback`.
5. Register the app. Copy the Client ID and generate a Client Secret.
6. In [Supabase Authentication → Providers](https://supabase.com/dashboard/project/basnmfloksrslqinonaw/auth/providers), enable GitHub and paste the Client ID and Client Secret. Save.
7. In [Supabase Authentication → URL Configuration](https://supabase.com/dashboard/project/basnmfloksrslqinonaw/auth/url-configuration), set Site URL to `https://awemissions.github.io/Watcher-parent-child/` and add that exact URL to Redirect URLs.
8. Open the dashboard and select **Sign in with GitHub**. Verify the return to the dashboard and sign-out.

**Security:** The parent dashboard's Supabase publishable key is intentionally public. Do not paste the GitHub OAuth secret, a Supabase service-role key, or a database password into GitHub source files or public issues.

**Important:** GitHub sign-in alone does not establish secure child pairing. The current child app does not upload events. A dedicated authenticated pairing and ingestion service must be implemented and tested before claiming automatic remote sync.
