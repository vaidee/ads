'use strict';

const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({});

let pool;
let cachedSecret;

async function loadDbSecret() {
  if (cachedSecret) return cachedSecret;
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
  );
  cachedSecret = JSON.parse(response.SecretString);
  return cachedSecret;
}

// Connects through RDS Proxy (DB_PROXY_ENDPOINT), not the Aurora cluster endpoint
// directly, so warm Lambda invocations reuse pooled connections instead of each
// opening its own connection to Postgres.
async function getPool() {
  if (pool) return pool;
  const secret = await loadDbSecret();
  pool = new Pool({
    host: process.env.DB_PROXY_ENDPOINT,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: secret.username,
    password: secret.password,
    ssl: { rejectUnauthorized: true },
    max: 2,
    idleTimeoutMillis: 30000,
    // Without this, a network path that silently drops packets (wrong
    // security group, missing route, etc.) makes pg wait indefinitely - the
    // Lambda just burns its full timeout with no error to show for it.
    connectionTimeoutMillis: 8000,
  });
  return pool;
}

// `client` is an optional PoolClient from withTransaction - lets repo functions
// participate in a caller's transaction without knowing about it explicitly.
async function query(text, params, client) {
  const runner = client || (await getPool());
  return runner.query(text, params);
}

async function withTransaction(fn) {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPool, query, withTransaction };
