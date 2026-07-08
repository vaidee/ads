#!/usr/bin/env node
'use strict';

// One-time bootstrap: applies a schema file to an Aurora Postgres database.
// Run against the cluster's writer endpoint (not the RDS Proxy) since it needs
// DDL privileges and only needs to run once per environment/migration.
//
// Usage: DB_HOST=... DB_NAME=... DB_USER=... DB_PASSWORD=... node db/migrate.js
// Usage (v2 additions, once v1's schema.sql is already applied):
//   SCHEMA_FILE=schema_v2.sql DB_HOST=... DB_NAME=... DB_USER=... DB_PASSWORD=... node db/migrate.js

const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const { Client } = require('pg');
const rdsCaCert = require('../functions/shared/rdsCaCert');

// See functions/shared/db.js for why this is a union with Node's default
// trust store rather than just the RDS bundle on its own.
const trustedCas = [...tls.rootCertificates, rdsCaCert];

async function main() {
  const { DB_HOST, DB_PORT = '5432', DB_NAME, DB_USER, DB_PASSWORD, SCHEMA_FILE = 'schema.sql' } = process.env;

  if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    throw new Error('DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD environment variables are required');
  }

  const schemaSql = fs.readFileSync(path.join(__dirname, '..', SCHEMA_FILE), 'utf8');

  const client = new Client({
    host: DB_HOST,
    port: Number(DB_PORT),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: true, ca: trustedCas },
  });

  await client.connect();
  try {
    await client.query(schemaSql);
    console.log(`${SCHEMA_FILE} applied successfully.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Failed to apply schema:', err);
  process.exitCode = 1;
});
