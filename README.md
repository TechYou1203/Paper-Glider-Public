# Paper Glider

An industry-grade arcade glider where you navigate a paper airplane through pencil obstacles across a sketchbook world with realistic physics, daily challenges, and global leaderboards.

## Local Setup

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file with the database and auth settings:
   ```
   DATABASE_URL=postgresql://user:password@host/database
   APP_URL=http://localhost:3000

   # Firebase web configuration. The API key is a public project identifier,
   # not a server secret; access is controlled by Firebase Security Rules.
   VITE_FIREBASE_API_KEY=your_web_api_key
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   FIREBASE_API_KEY=your_web_api_key
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

The app will be available at `http://localhost:3000`. The API server runs separately with `npm run server` and listens on port `3001`.

## Security

- **Sessions:** pilot sessions are carried in the `pg_session` HttpOnly, `SameSite=Lax` cookie. The server issues, rotates and expires it. Browser JavaScript never stores bearer tokens or password material in `localStorage`.
- **Headers:** `server/http.ts` and `vercel.json` set CSP, Referrer-Policy, `X-Content-Type-Options`, `X-Frame-Options`, Permissions-Policy, COOP/CORP and HSTS. The CSP forbids inline JavaScript; service worker registration lives in `public/register-sw.js`.
- **Authoritative state:** ranks, paperclips, skins and challenge rewards are awarded by the server from verified replay data. Client-side values are display state only.

### DNS and email hardening checklist

These records cannot be created from the repository. Apply them at the domain's DNS provider and hosting dashboard:

1. **DNSSEC:** enable DNSSEC for the custom domain at the registrar/DNS provider, then publish the resulting DS record at the registrar. `*.vercel.app` names are managed by Vercel and cannot be independently signed.
2. **MX and email authentication:** if the domain receives mail, publish the provider's MX records and SPF, DKIM and DMARC records. If it does not receive mail, remove stale MX records rather than pointing them at an unrelated host.
3. **MTA-STS:** the policy is served at `/.well-known/mta-sts.txt` (and from `public/.well-known/mta-sts.txt` on Vercel). To activate it:
   - publish `_mta-sts.<domain>` TXT `v=STSv1; id=<policy-version>` (change the id whenever the policy changes);
   - serve `https://mta-sts.<domain>/.well-known/mta-sts.txt` from this project (add the `mta-sts` subdomain to the hosting project);
   - keep `mode: testing` until delivery reports are clean, then switch to `mode: enforce` and add an `mx:` line for every MX host.
   - optionally publish `_smtp._tls.<domain>` TXT `v=TLSRPTv1; rua=mailto:tls-reports@<domain>` for TLS reporting.

The scan may still report DNS findings until these external records are published.
