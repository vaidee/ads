'use strict';

const db = require('./db');

// SPEC_v2 V2-1: closed-set contracted-talent roster, matched via TwelveLabs
// Entity Search. The entity/reference images themselves are created directly
// in the TwelveLabs Playground - db/import-talent-reference.js only links an
// already-created entity to a client, it doesn't create entities itself.
async function insert({
  clientId,
  name,
  tlEntityCollectionId,
  tlEntityId,
  contractStart,
  contractEnd,
  status,
  consentConfirmedBy,
}) {
  const result = await db.query(
    `INSERT INTO talent_references
       (client_id, name, tl_entity_collection_id, tl_entity_id, contract_start, contract_end, status,
        consent_confirmed_by, consent_confirmed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     RETURNING *`,
    [
      clientId,
      name,
      tlEntityCollectionId,
      tlEntityId,
      contractStart || null,
      contractEnd || null,
      status || 'active',
      consentConfirmedBy,
    ]
  );
  return result.rows[0];
}

// detect-talent pipeline step: cost control - only search against a client's
// CURRENTLY active talent, not the full historical roster (SPEC_v2 V2-1).
async function listActiveByClientId(clientId) {
  const result = await db.query(`SELECT * FROM talent_references WHERE client_id = $1 AND status = 'active'`, [
    clientId,
  ]);
  return result.rows;
}

module.exports = { insert, listActiveByClientId };
