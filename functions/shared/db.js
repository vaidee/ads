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
  });
  return pool;
}

async function query(text, params) {
  const p = await getPool();
  return p.query(text, params);
}

module.exports = { getPool, query };
