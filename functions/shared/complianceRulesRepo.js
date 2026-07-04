'use strict';

const db = require('./db');

async function listEnabled() {
  const result = await db.query('SELECT * FROM compliance_rules WHERE enabled = true');
  return result.rows;
}

module.exports = { listEnabled };
