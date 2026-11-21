# Privacy and security answers (draft)

Facts below come from the code and manifest. Items marked **[VERIFY]** must be checked before submission.

## What data Precedent stores (Forge SQL, in Atlassian's cloud)
- Decisions: title, statement, rationale, status, dates, owner and decider account IDs, rejected alternatives, keywords, project and component names.
- Source references: Jira issue keys and IDs, Confluence page IDs, and their URLs (no page or issue content is copied).
- Conflict cache: issue ID, issue key, a content hash, matched decision IDs and confidence (for the sidebar badge).
- Feedback: "not related" marks and revisit reasons with the account ID that made them.
- Settings: admin toggles and keyword aliases.

Precedent does **not** copy Jira descriptions, comments or Confluence page bodies into its own storage. Issue and page text is read at check time and used only to compute matches.

## Access model
- Every call requires a signed-in user (`context.accountId`); inputs cannot choose the user.
- Decisions are returned only if the caller can view every source they cite (Jira browse permission; Confluence read permission). Errors fail closed.
- Background checks (triggers) run as the app, never with a user's graph access.

## Scopes (17)
read:jira-work, write:jira-work, read:jira-user, read:permission:jira, read:page:confluence, read:confluence-content.permission, read:chat:rovo, read:graph:issue:jira, read:graph:issue-comment:jira, read:graph:project:jira, read:graph:page:confluence, read:graph:comment:confluence, read:graph:space:confluence, read:graph:user:atlassian, read:graph:team:atlassian, read:graph:goal:atlassian, read:graph:project:atlassian.

Write access is used only to add the `precedent-conflict` label, the optional single conflict comment (admin opt-in, off by default), and owner notifications for revisits and reminders.

## External network
- No calls to third-party domains. All requests go to the site's own Jira, Confluence and Teamwork Graph APIs.
- **[VERIFY]** the manifest declares an `llm` module (`rerank-llm`) for a planned optional re-rank. The current code does not call it. Either remove the module before submission or document it as off by default.

## Data retention and deletion
- Uninstalling the app removes its data as Forge does for app storage. **[VERIFY]** the exact retention behaviour in Atlassian's uninstall documentation.
- Individual decisions can be deleted by editing; there is no bulk delete yet. Add one if listing reviewers ask.

## Data residency
- **[VERIFY]** where Forge SQL data is stored for each Atlassian region, and what options a customer has. Write the answer from Atlassian's current Forge data residency documentation, not from memory.

## Other answers
- Authentication: Atlassian accounts only (no separate login).
- Logging: app logs contain decision IDs and issue keys, not page or issue text. Errors log stack traces without user content.
- Vulnerability handling: dependencies are reviewed at release time with `npm audit` **[VERIFY before submission]**.
