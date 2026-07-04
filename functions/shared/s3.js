'use strict';

const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({});

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
