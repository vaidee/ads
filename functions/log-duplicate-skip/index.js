'use strict';

// SPEC.md section 3.1, step 2 ("Yes" branch of IsDuplicate): the filename already
// exists in `ads` and this isn't a reprocess run, so the pipeline ends here
// without creating a row or spending TwelveLabs minutes. There's nothing to
// persist yet at this point (no ads row exists for a rejected duplicate), so this
// is a structured CloudWatch log entry rather than a database write.
exports.handler = async (event) => {
  console.log(JSON.stringify({
    event: 'duplicate_skipped',
    filename: event.filename,
    s3Bucket: event.s3Bucket,
    s3Key: event.s3Key,
    source: event.source,
    existingAdId: event.adId,
  }));

  return { ...event, skipped: true };
};
