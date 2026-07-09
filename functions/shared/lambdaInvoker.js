'use strict';

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({});

// v3 status redesign: POST /ads/{id}/approve fires run-platform-compliance
// in the background this way rather than making the reviewer's request wait
// on it - API Gateway has a hard ~29s integration timeout regardless of the
// target Lambda's own timeout, and Analyze calls have been slow in practice
// (see run-compliance-analysis's 60s timeout for the same reason). The
// caller gets its response immediately; platform_compliance rows fill in
// once this invocation completes.
async function invokeAsync(functionName, payload) {
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: JSON.stringify(payload),
    })
  );
}

module.exports = { invokeAsync };
