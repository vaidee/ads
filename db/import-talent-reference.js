#!/usr/bin/env node
'use strict';

// One-off admin script (SPEC_v2 V2-1) - links a talent entity you've already
// created directly in the TwelveLabs Playground (reference images, the
// entity_collection, the entity itself - this script does NOT create any of
// that) to a client + contract terms in this app's database. There is
// deliberately no UI/API for this; SPEC_v2 explicitly defers the "reference
// image upload flow + consent UX" to a later thread.
//
// Reuses the same RDS-Proxy env vars every Lambda uses (functions/shared/db.js,
// clientsRepo.js, talentReferencesRepo.js, twelveLabs.js) rather than a direct
// cluster connection like db/migrate.js - plain INSERT/SELECT don't need the
// DDL privileges a direct connection is for.
//
// Must run from a Tier B (NAT-routed) VPC-attached CloudShell, not Tier A -
// this needs both DB access (VPC) AND internet access to reach TwelveLabs,
// same gotcha as the git clone/npm install hang from earlier in this project.
//
// Usage:
//   DB_PROXY_ENDPOINT=... DB_SECRET_ARN=... DB_NAME=ads \
//   TL_API_KEY_SECRET_ARN=... [TL_API_BASE_URL=...] \
//   CLIENT_NAME="Acme Beauty" [CLIENT_TYPE=brand] \
//   TALENT_NAME="Jane Creator" TL_ENTITY_COLLECTION_ID=... TL_ENTITY_ID=... \
//   [CONTRACT_START=2026-01-01] [CONTRACT_END=2026-12-31] [TALENT_STATUS=active] \
//   CONSENT_CONFIRMED_BY=you@example.com \
//   node db/import-talent-reference.js

const clientsRepo = require('../functions/shared/clientsRepo');
const talentReferencesRepo = require('../functions/shared/talentReferencesRepo');
const twelveLabs = require('../functions/shared/twelveLabs');
const { getPool } = require('../functions/shared/db');

async function main() {
  const {
    CLIENT_NAME,
    CLIENT_TYPE = 'brand',
    TALENT_NAME,
    TL_ENTITY_COLLECTION_ID,
    TL_ENTITY_ID,
    CONTRACT_START,
    CONTRACT_END,
    TALENT_STATUS = 'active',
    CONSENT_CONFIRMED_BY,
  } = process.env;

  if (!CLIENT_NAME || !TALENT_NAME || !TL_ENTITY_COLLECTION_ID || !TL_ENTITY_ID || !CONSENT_CONFIRMED_BY) {
    throw new Error(
      'CLIENT_NAME, TALENT_NAME, TL_ENTITY_COLLECTION_ID, TL_ENTITY_ID, and CONSENT_CONFIRMED_BY are required'
    );
  }

  // Confirms the entity actually exists (and the id was typed correctly)
  // before writing anything - fails loudly here rather than silently
  // persisting an entity id that detect-talent will later just never match.
  const entity = await twelveLabs.getEntity(TL_ENTITY_COLLECTION_ID, TL_ENTITY_ID);
  console.log(`Confirmed TwelveLabs entity: ${entity.name || TL_ENTITY_ID}`);

  const client = await clientsRepo.findOrCreateByName(CLIENT_NAME, CLIENT_TYPE);
  console.log(`Client: ${client.name} (${client.id})`);

  const talentReference = await talentReferencesRepo.insert({
    clientId: client.id,
    name: TALENT_NAME,
    tlEntityCollectionId: TL_ENTITY_COLLECTION_ID,
    tlEntityId: TL_ENTITY_ID,
    contractStart: CONTRACT_START,
    contractEnd: CONTRACT_END,
    status: TALENT_STATUS,
    consentConfirmedBy: CONSENT_CONFIRMED_BY,
  });

  console.log('talent_references row created:', talentReference);
  console.log(`\nTo actually test detection, set this ad's client_id by hand: UPDATE ads SET client_id = '${client.id}' WHERE id = '<ad-id>';`);
}

main()
  .catch((err) => {
    console.error('Failed to import talent reference:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    (await getPool()).end();
  });
