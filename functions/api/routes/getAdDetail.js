'use strict';

const adsRepo = require('../../shared/adsRepo');
const complianceFlagsRepo = require('../../shared/complianceFlagsRepo');
const reviewCommentsRepo = require('../../shared/reviewCommentsRepo');
const statusHistoryRepo = require('../../shared/statusHistoryRepo');
const publishRecordsRepo = require('../../shared/publishRecordsRepo');
const s3 = require('../../shared/s3');
const { ok, notFound } = require('../http');

// GET /ads/{id}: full detail - ad + flags + comments + status history + publish records.
module.exports = async (event) => {
  const { id } = event.pathParameters;
  const ad = await adsRepo.findById(id);
  if (!ad) return notFound('Ad not found');

  const [flags, comments, statusHistory, publishRecords, playbackUrl] = await Promise.all([
    complianceFlagsRepo.listByAdId(id),
    reviewCommentsRepo.listByAdId(id),
    statusHistoryRepo.listByAdId(id),
    publishRecordsRepo.listByAdId(id),
    s3.getPresignedGetUrl(ad.s3_bucket, ad.s3_key),
  ]);

  return ok({ ad, playbackUrl, flags, comments, statusHistory, publishRecords });
};
