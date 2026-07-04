'use strict';

const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');

const sfnClient = new SFNClient({});

// POST /ads/{id}/reprocess: starts the same state machine directly, bypassing
// TriggerIngest's duplicate check (source = 'reprocess', reuses the existing ad_id).
async function startReprocessExecution({ adId, s3Bucket, s3Key, filename }) {
  await sfnClient.send(
    new StartExecutionCommand({
      stateMachineArn: process.env.STATE_MACHINE_ARN,
      input: JSON.stringify({ source: 'reprocess', adId, s3Bucket, s3Key, filename }),
    })
  );
}

module.exports = { startReprocessExecution };
