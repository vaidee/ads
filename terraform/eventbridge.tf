# S3 -> EventBridge -> Step Functions (architecture diagram in SPEC.md section 3).
# aws_s3_bucket_notification is authoritative for a bucket's whole notification
# config, so if this bucket already has other notification targets managed
# elsewhere, they need to be merged into this resource rather than left separate.
data "aws_s3_bucket" "ingest" {
  bucket = var.ingest_bucket_name
}

# The UI talks to this bucket directly from the browser - a presigned PUT for
# uploads (createUploadUrl) and a presigned GET for video playback
# (getAdDetail) - so it needs its own CORS config distinct from API Gateway's
# (api.tf). Reuses cors_allow_origins for a single source of truth on "the
# UI's origin(s)".
resource "aws_s3_bucket_cors_configuration" "ingest" {
  bucket = data.aws_s3_bucket.ingest.id

  cors_rule {
    allowed_origins = var.cors_allow_origins
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_notification" "ingest_eventbridge" {
  bucket      = data.aws_s3_bucket.ingest.id
  eventbridge = true
}

resource "aws_cloudwatch_event_rule" "ingest_object_created" {
  name = "${var.name_prefix}-object-created"

  event_pattern = jsonencode({
    source      = ["aws.s3"]
    detail-type = ["Object Created"]
    detail = {
      bucket = {
        name = [var.ingest_bucket_name]
      }
    }
  })

  depends_on = [aws_s3_bucket_notification.ingest_eventbridge]
}

data "aws_iam_policy_document" "events_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventbridge_start_execution" {
  name               = "${var.name_prefix}-eventbridge-start-execution"
  assume_role_policy = data.aws_iam_policy_document.events_assume_role.json
}

data "aws_iam_policy_document" "eventbridge_start_execution" {
  statement {
    actions   = ["states:StartExecution"]
    resources = [aws_sfn_state_machine.ingest_pipeline.arn]
  }
}

resource "aws_iam_role_policy" "eventbridge_start_execution" {
  name   = "${var.name_prefix}-eventbridge-start-execution"
  role   = aws_iam_role.eventbridge_start_execution.id
  policy = data.aws_iam_policy_document.eventbridge_start_execution.json
}

resource "aws_cloudwatch_event_target" "ingest_pipeline" {
  rule     = aws_cloudwatch_event_rule.ingest_object_created.name
  arn      = aws_sfn_state_machine.ingest_pipeline.arn
  role_arn = aws_iam_role.eventbridge_start_execution.arn
}
