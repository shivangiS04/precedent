# Decisions

Running log of product and platform decisions for Precedent. Newest first.

## 2026-11-11 — M0: scaffold, deploy, Marketplace answers

| # | Decision | Why |
|---|----------|-----|
| D10 | **Badge: `jira:issueContext`** with `dynamicProperties` (always in the issue sidebar, no admin setup); keep `jira:issuePanel` for full conflict cards | `jira:issueGlance` was deprecated in 2023 and replaced by issueContext. The issue panel only appears after a click or an admin's "Show for all work items" |
| D11 | Verify in M2 when Jira first calls `dynamicProperties` | Docs say it runs on the panel's first expand, so the lozenge may read "Not checked" until then. Fallback: the trigger's `precedent:conflict` label is always visible |
| D12 | **One app, one Marketplace listing** (Jira required, Confluence optional) | Marketplace detects compatibility from the manifest and installs into Jira, with Confluence connected during install. Cross-product calls work once connected |
| D13 | **Judges install an unlicensed copy** ("Precedent – Judges", its own app id, distribution *Sharing*) | An app with licensing in its manifest, or submitted to Marketplace, can't be shared by install link |
| D14 | `licensing.enabled` stays off until M9 | Keeps install-link testing possible during development |
| D15 | Register Teamwork Graph persisted queries in **M1** (moved from M6) | About a minute to propagate; early registration de-risks M6 |
| D16 | One function per action | Clear logs and handler isolation; no dispatch on `moduleKey` |
| D17 | Scope count is **17** (not 18 as first stated) | Recount of the manifest |

Results: `tsc` clean, 22/22 Jest tests pass, `forge lint` clean. Deployed v2.0.0 to development; **eligible for Runs on Atlassian**.

## 2026-11-11 — M0: platform verification (Forge MCP server)

### Locked choices
| # | Decision | Why |
|---|----------|-----|
| D1 | Jira required, Confluence optional (multi-app compatibility) | Decisions live in Confluence; conflicts surface in Jira |
| D2 | Paid Marketplace listing, lowest tier, free trial | Multi-app listings can't be free |
| D3 | No Confluence full-page modules | Bug ECO-1503 (full-page modules for both products fail validation) |
| D4 | Runtime `nodejs24.x` | Recommended by the platform |
| D5 | Forge LLM re-rank behind admin toggle, built in M8; `llm` module declared in M0 | Keeps Runs on Atlassian; avoids a later major version |
| D6 | Single manifest including `rovo:skill` | Skill is Preview and deploys to all environments |
| D7 | Declare every scope in M0 | Scope changes are major versions; avoid them after Marketplace submission |
| D8 | Issue panel runs the conflict check live; the trigger is cache only | Trigger delivery can take up to 3 minutes |
| D9 | Action list inputs are newline-delimited strings, validated server-side | Action inputs only allow string, integer, number, boolean |

### Findings from the Forge MCP server that changed the design
1. **Teamwork Graph: raw `cypherQuery` is unavailable to new apps.** We use curated queries or
   **persisted Cypher queries**, registered once per app (TWG Labs, or
   `POST https://<site>.atlassian.net/gateway/api/twg/cypher-queries`) and run with `customQuery(queryKey)`.
   Registration is idempotent, takes about a minute to propagate, and returns `QUERY_NOT_FOUND` until then.
   → `scripts/register-twg-queries.ts`; query keys stored in config. Page size is at most 25.
2. **TWG scopes: missing or withheld scopes fail silently** (empty results, no error). We log it and show
   "graph context unavailable" in the UI. Admins can toggle individual graph scopes.
3. **Calls from external MCP clients using `asUser()` can fail** (known issue) unless the user has an app
   consent entry. MCP tools use `asApp()` plus explicit permission checks for `context.accountId`:
   Jira `POST /rest/api/3/permissions/check` (`read:permission:jira`) and Confluence
   `POST /wiki/rest/api/content/{id}/permission/check` (`read:confluence-content.permission`).
4. **`jira:issuePanel` appears only after a user clicks its button** (users who can edit the issue), but Jira
   admins can choose **"Show for all work items"**. The demo setup includes this step. `icon` is required.
5. **SQL migrations:** queue + consumer (900 s timeout), triggered by `avi:forge:installed:app` /
   `avi:forge:upgraded:app`, plus an hourly scheduled sweeper (upgrade events fire on major versions only).
   No foreign keys, no `AUTO_INCREMENT` (UUIDs), one statement per query.
6. **`read:chat:rovo`** is needed so customer-built agents (Rovo Studio / `rovo:mcp`) can use our actions.
7. **Forge LLM keeps Runs on Atlassian eligibility** (confirmed in the SDK reference).
8. Agent prompt as a resource: `prompt: resource:<key>;<path>` (confirmed).
9. `jira:globalPage` allows a single instance per app; settings go in `jira:adminPage`.
