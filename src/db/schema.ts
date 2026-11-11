/**
 * Forge SQL schema (MySQL-compatible, TiDB).
 *
 * Rules from the Forge SQL docs that shape this file:
 * - One statement per query, so each DDL is its own migration step.
 * - No foreign keys and no cascading deletes, so the app layer owns referential integrity.
 * - Avoid AUTO_INCREMENT; ids are UUID strings generated in the app.
 * - Migrations are append-only. Never edit or reorder an existing entry, only add new ones.
 */
export interface Migration {
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    name: 'v001_create_decisions',
    sql: `CREATE TABLE IF NOT EXISTS decisions (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      statement TEXT NOT NULL,
      status VARCHAR(16) NOT NULL,
      rationale TEXT,
      owner_account_id VARCHAR(128),
      decided_at DATE,
      revisit_by DATE,
      superseded_by VARCHAR(36),
      graph_context JSON,
      graph_fetched_at DATETIME,
      created_by VARCHAR(128),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'v002_create_decision_alternatives',
    sql: `CREATE TABLE IF NOT EXISTS decision_alternatives (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      decision_id VARCHAR(36) NOT NULL,
      alternative VARCHAR(255) NOT NULL,
      reason TEXT,
      KEY idx_alt_decision (decision_id)
    )`,
  },
  {
    // kind: project | component | label | keyword
    name: 'v003_create_decision_scope',
    sql: `CREATE TABLE IF NOT EXISTS decision_scope (
      decision_id VARCHAR(36) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      value VARCHAR(255) NOT NULL,
      PRIMARY KEY (decision_id, kind, value),
      KEY idx_scope_lookup (kind, value)
    )`,
  },
  {
    name: 'v004_create_decision_deciders',
    sql: `CREATE TABLE IF NOT EXISTS decision_deciders (
      decision_id VARCHAR(36) NOT NULL,
      account_id VARCHAR(128) NOT NULL,
      PRIMARY KEY (decision_id, account_id)
    )`,
  },
  {
    // kind: jira-issue | jira-comment | confluence-page
    // ref = issue key or page id; ref_numeric_id = Jira issue id (needed for permission checks)
    name: 'v005_create_decision_sources',
    sql: `CREATE TABLE IF NOT EXISTS decision_sources (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      decision_id VARCHAR(36) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      ref VARCHAR(255) NOT NULL,
      ref_numeric_id BIGINT,
      comment_id VARCHAR(64),
      url VARCHAR(1024),
      KEY idx_src_decision (decision_id)
    )`,
  },
  {
    // Trigger cache; the issue panel always re-checks live.
    name: 'v006_create_conflict_results',
    sql: `CREATE TABLE IF NOT EXISTS conflict_results (
      issue_id VARCHAR(32) NOT NULL PRIMARY KEY,
      issue_key VARCHAR(64) NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      result JSON NOT NULL,
      commented TINYINT(1) NOT NULL DEFAULT 0,
      checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    // kind: acknowledge | revisit | not-related
    name: 'v007_create_feedback',
    sql: `CREATE TABLE IF NOT EXISTS feedback (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      decision_id VARCHAR(36) NOT NULL,
      issue_key VARCHAR(64),
      account_id VARCHAR(128) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      reason TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_fb_decision (decision_id)
    )`,
  },
  {
    // App settings and Teamwork Graph persisted query keys.
    name: 'v008_create_settings',
    sql: `CREATE TABLE IF NOT EXISTS settings (
      setting_key VARCHAR(128) NOT NULL PRIMARY KEY,
      value JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
];
