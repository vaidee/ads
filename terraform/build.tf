# TriggerIngest requires npm dependencies (pg) and the shared modules it imports
# via relative paths, so it's bundled with esbuild before zipping - mirrors the
# BuildMethod: esbuild config in infra/template.yaml (SAM).
# LogDuplicateSkip has no dependencies or imports, so it's zipped as-is.

resource "null_resource" "build_trigger_ingest" {
  triggers = {
    index_hash      = filesha256("${path.module}/../functions/trigger-ingest/index.js")
    normalize_hash  = filesha256("${path.module}/../functions/trigger-ingest/normalizeIngestEvent.js")
    db_hash         = filesha256("${path.module}/../functions/shared/db.js")
    s3_hash         = filesha256("${path.module}/../functions/shared/s3.js")
    ads_repo_hash   = filesha256("${path.module}/../functions/shared/adsRepo.js")
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild functions/trigger-ingest/index.js --bundle --platform=node --target=node20 --external:@aws-sdk/* --outfile=terraform/dist/trigger-ingest/index.js"
  }
}

data "archive_file" "trigger_ingest" {
  type        = "zip"
  source_dir  = "${path.module}/dist/trigger-ingest"
  output_path = "${path.module}/dist/trigger-ingest.zip"
  depends_on  = [null_resource.build_trigger_ingest]
}

data "archive_file" "log_duplicate_skip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/log-duplicate-skip"
  output_path = "${path.module}/dist/log-duplicate-skip.zip"
}
