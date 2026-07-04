'use strict';

const db = require('./db');

async function upsertFromClaims({ sub, email }) {
  const result = await db.query(
    `INSERT INTO users (cognito_sub, email)
     VALUES ($1, $2)
     ON CONFLICT (cognito_sub) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [sub, email]
  );
  return result.rows[0];
}

module.exports = { upsertFromClaims };
