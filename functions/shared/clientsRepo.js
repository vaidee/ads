'use strict';

const db = require('./db');

// SPEC_v2 V2-1: minimal multi-tenancy scaffold, just enough to unblock
// talent_references (which must be scoped per client). Full multi-tenant
// redesign (per-client compliance_rules, Cognito group-based access scoping,
// dashboard client filtering) is a separate, not-yet-designed thread - there
// is deliberately no API/UI for managing clients, only this used by
// db/import-talent-reference.js.
async function findOrCreateByName(name, type = 'brand') {
  const existing = await db.query('SELECT * FROM clients WHERE name = $1', [name]);
  if (existing.rows[0]) return existing.rows[0];

  const result = await db.query('INSERT INTO clients (name, type) VALUES ($1, $2) RETURNING *', [name, type]);
  return result.rows[0];
}

module.exports = { findOrCreateByName };
