# Judges' copy: setup and install guide

## One-time setup (owner)
1. In the Developer Console, open the Developer Space **precedent** and create an app named **Precedent – Judges**. Do not add licensing.
2. Copy its app ID (`ari:cloud:ecosystem::app/<uuid>`) into `.env` as `JUDGES_APP_ID=...`.
3. Deploy: `npm run deploy:judges`. (The Marketplace build is `npm run deploy:marketplace`; do not run it until the listing is approved.)
4. In the console, set the app's distribution to **Sharing** so the install link works.
5. Register the Teamwork Graph queries for the judges app in TWG Labs (see the query list in `src/twg/queries.json`). Until then, graph context is simply hidden for judges; the rest works.
6. Install it on the judges' Jira and Confluence site (install link from the console).
7. Load the demo data: **Precedent settings → Load Northwind demo data**.

## Judges' install guide (for Devpost)
1. Open the install link and choose a Jira site that also has Confluence.
2. Approve the permissions. They are read-only except for the optional label and comment.
3. Open **Apps → Decision Ledger**: 15 example decisions for a fictional company.
4. Open PLAT-33511 ("Add Redis cache for user sessions"). The **Precedent** panel shows a conflict with a rejected alternative.
5. Ask Precedent in Rovo: "what did we decide about caching and why?"
6. Optional: Confluence page with an ADR → **Record as decision**.

## Known differences in the judges' copy
- Teamwork Graph context is hidden until the queries are registered for the judges app.
- Licensing is off, so there is no trial or purchase step.
