'use strict';

const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// requestChecksumCalculation defaults to 'WHEN_SUPPORTED' in current SDK
// versions, which auto-attaches a flexible checksum (x-amz-checksum-crc32) to
// every PutObjectCommand - including presigned ones. getSignedUrl has to bake
// that checksum into the signature before the real body exists, so it signs
// the checksum of an empty payload; the browser's actual PUT (real video
// bytes) then fails S3's checksum/signature validation with 403. Only compute
// checksums when a caller explicitly opts in via ChecksumAlgorithm.
const s3Client = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED' });

async function headObject(bucket, key) {
  return s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

// Videos live in a private bucket; downstream steps (TwelveLabs indexing) need a
// temporary, unauthenticated URL to fetch the file rather than raw S3 credentials.
async function getPresignedGetUrl(bucket, key, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

// POST /ads/upload-url: the browser PUTs directly to S3 with this URL. Metadata
// set here becomes part of the signature, so the client must send matching
// x-amz-meta-* headers on the actual PUT - see createUploadUrl's response.
async function getPresignedPutUrl(bucket, key, { metadata, contentType, expiresInSeconds = 900 } = {}) {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, Metadata: metadata, ContentType: contentType });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

module.exports = { headObject, getPresignedGetUrl, getPresignedPutUrl };
