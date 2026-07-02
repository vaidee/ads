data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# --- TriggerIngest (SPEC.md 3.1 step 1) ---------------------------------

resource "aws_iam_role" "trigger_ingest" {
  name               = "${var.name_prefix}-trigger-ingest"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "trigger_ingest_basic" {
  role       = aws_iam_role.trigger_ingest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "trigger_ingest_vpc" {
  role       = aws_iam_role.trigger_ingest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "trigger_ingest_inline" {
  statement {
    sid       = "ReadIngestBucketObjects"
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::${var.ingest_bucket_name}/*"]
  }

  statement {
    sid       = "ReadDbSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_rds_cluster.this.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "trigger_ingest_inline" {
  name   = "${var.name_prefix}-trigger-ingest-inline"
  role   = aws_iam_role.trigger_ingest.id
  policy = data.aws_iam_policy_document.trigger_ingest_inline.json
}

resource "aws_cloudwatch_log_group" "trigger_ingest" {
  name              = "/aws/lambda/${var.name_prefix}-trigger-ingest"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "trigger_ingest" {
  function_name    = "${var.name_prefix}-trigger-ingest"
  description      = "SPEC.md 3.1 step 1 - receive S3/reprocess event, presign S3 reference, look up filename in ads."
  role             = aws_iam_role.trigger_ingest.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.trigger_ingest.output_path
  source_code_hash = data.archive_file.trigger_ingest.output_base64sha256

  vpc_config {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = {
      DB_SECRET_ARN     = aws_rds_cluster.this.master_user_secret[0].secret_arn
      DB_PROXY_ENDPOINT = aws_db_proxy.this.endpoint
      DB_NAME           = var.db_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.trigger_ingest,
    aws_iam_role_policy_attachment.trigger_ingest_basic,
    aws_iam_role_policy_attachment.trigger_ingest_vpc,
  ]
}

# --- LogDuplicateSkip (SPEC.md 3.1 step 2, "Yes" branch) ----------------

resource "aws_iam_role" "log_duplicate_skip" {
  name               = "${var.name_prefix}-log-duplicate-skip"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "log_duplicate_skip_basic" {
  role       = aws_iam_role.log_duplicate_skip.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "log_duplicate_skip" {
  name              = "/aws/lambda/${var.name_prefix}-log-duplicate-skip"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "log_duplicate_skip" {
  function_name = "${var.name_prefix}-log-duplicate-skip"
  description   = "SPEC.md 3.1 step 2 (Yes branch) - log a skipped duplicate ingestion."
  role          = aws_iam_role.log_duplicate_skip.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 128

  filename         = data.archive_file.log_duplicate_skip.output_path
  source_code_hash = data.archive_file.log_duplicate_skip.output_base64sha256

  depends_on = [
    aws_cloudwatch_log_group.log_duplicate_skip,
    aws_iam_role_policy_attachment.log_duplicate_skip_basic,
  ]
}
