'use strict';

const { S3Client, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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

module.exports = { headObject, getPresignedGetUrl };
