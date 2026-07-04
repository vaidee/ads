#!/usr/bin/env node
'use strict';

// One-time bootstrap: applies schema.sql to an Aurora Postgres database.
// Run against the cluster's writer endpoint (not the RDS Proxy) since it needs
// DDL privileges and only needs to run once per environment.
//
// Usage: DB_HOST=... DB_NAME=... DB_USER=... DB_PASSWORD=... node db/migrate.js

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const rdsCaCert = require('../functions/shared/rdsCaCert');

async function main() {
  const { DB_HOST, DB_PORT = '5432', DB_NAME, DB_USER, DB_PASSWORD } = process.env;

  if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    throw new Error('DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD environment variables are required');
  }

  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

  const client = new Client({
    host: DB_HOST,
    port: Number(DB_PORT),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    // rejectUnauthorized without `ca` fails every connection - Aurora's
    // certificate is signed by Amazon's own RDS CA, which isn't in Node's
    // default trust store.
    ssl: { rejectUnauthorized: true, ca: rdsCaCert },
  });

  await client.connect();
  try {
    await client.query(schemaSql);
    console.log('schema.sql applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Failed to apply schema:', err);
  process.exitCode = 1;
});
