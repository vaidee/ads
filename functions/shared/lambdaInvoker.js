'use strict';

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({});

// POST /ads/{id}/publish (SPEC_v2 V2-2): fires the platform-specific Analyze
// call in the background rather than making the reviewer's request wait on
// it - API Gateway has a hard ~29s integration timeout regardless of the
// target Lambda's own timeout, and Analyze calls have been slow in practice
// (see run-compliance-analysis's 60s timeout for the same reason). The
// caller gets the publish_records row back immediately with
// platform_verdict/platform_flags still null; they fill in once this
// invocation completes.
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
