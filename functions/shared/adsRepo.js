'use strict';

const db = require('./db');

async function findByFilename(filename) {
  const result = await db.query('SELECT id, status FROM ads WHERE filename = $1', [filename]);
  return result.rows[0] || null;
}

module.exports = { findByFilename };
