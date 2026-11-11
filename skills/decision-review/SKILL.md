---
name: decision-review
description: Review a proposal, RFC, design doc or Jira ticket against the team's recorded decisions. Use when a user asks whether a proposed change conflicts with past decisions or wants a structured precedent review before work starts.
allowed-tools: find-precedent check-conflict get-decision-context
---

# Decision review

Review the proposal against the Decision Ledger and give a verdict the team can act on.

## Steps

1. **Extract the claims.** List the concrete technical or process choices the proposal makes, for example "introduce Redis for session caching" or "add a GraphQL endpoint for partners". Ignore background and motivation text.
2. **Check each claim.**
   - If the proposal is a Jira issue, call `check-conflict` with `issueKey`.
   - Otherwise call `check-conflict` with `text` set to the claim.
   - Also call `find-precedent` for each claim's main topic, to catch related decisions that aren't conflicts.
3. **Get context for conflicts.** For every high- or medium-confidence conflict, call `get-decision-context` to get the owner, deciders, related goals and teams.
4. **Write the review** in the output format below.

## Output format

**Verdict:** one of
- ✅ **Clear**: no conflicts found.
- ⚠️ **Needs discussion**: medium-confidence conflicts, or a matching decision in status `revisit` or `proposed`.
- ⛔ **Conflicts with an accepted decision**: at least one high-confidence conflict with an `accepted` decision.

**Conflicts** (one bullet each): decision title (status) · the rejected alternative or constraint it collides with · confidence · owner to talk to · source link.

**Related decisions:** title · one-line relevance · source link.

**Suggested next step:** one sentence.

## Escalation rules

- A high-confidence conflict with an `accepted` decision: recommend talking to the owner **before** work starts. Suggest `propose-revisit` only if the user gives a reason that something has changed.
- A conflict with a `superseded` decision: ignore it, and check its replacement instead.
- Decisions past their `revisit_by` date: mention that they're due for revisit; don't treat them as binding.
- No results: say "There's no recorded decision about this." Never infer one.
- An action returns `rejected` or `error`: report it and stop. Don't retry with altered inputs.
