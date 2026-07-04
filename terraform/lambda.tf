data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# --- Pipeline Lambdas (SPEC.md 3.1 steps 1, 3-9) + weekly-eval (section 8.1) --
# All of these need Postgres via VPC + the DB secret; "api" is handled
# separately in api.tf (see locals.tf for why).

resource "aws_iam_role" "function" {
  for_each           = local.function_config
  name               = "${var.name_prefix}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "function_basic" {
  for_each   = local.function_config
  role       = aws_iam_role.function[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "function_vpc" {
  for_each   = local.function_config
  role       = aws_iam_role.function[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "function_db_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_rds_cluster.this.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "function_db_secret" {
  for_each = local.function_config
  name     = "${var.name_prefix}-${each.key}-db-secret"
  role     = aws_iam_role.function[each.key].id
  policy   = data.aws_iam_policy_document.function_db_secret.json
}

data "aws_iam_policy_document" "function_tl_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.tl_api_key.arn]
  }
}

resource "aws_iam_role_policy" "function_tl_secret" {
  for_each = local.needs_tl_secret
  name     = "${var.name_prefix}-${each.key}-tl-secret"
  role     = aws_iam_role.function[each.key].id
  policy   = data.aws_iam_policy_document.function_tl_secret.json
}

data "aws_iam_policy_document" "function_s3_read" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::${var.ingest_bucket_name}/*"]
  }
}

resource "aws_iam_role_policy" "function_s3_read" {
  for_each = local.needs_s3_read
  name     = "${var.name_prefix}-${each.key}-s3-read"
  role     = aws_iam_role.function[each.key].id
  policy   = data.aws_iam_policy_document.function_s3_read.json
}

resource "aws_cloudwatch_log_group" "function" {
  for_each          = local.function_config
  name              = "/aws/lambda/${var.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "bundled" {
  for_each = local.function_config

  function_name    = "${var.name_prefix}-${each.key}"
  role             = aws_iam_role.function[each.key].arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = each.value.timeout
  memory_size      = each.value.memory
  filename         = data.archive_file.bundled[each.key].output_path
  source_code_hash = data.archive_file.bundled[each.key].output_base64sha256

  vpc_config {
    subnet_ids         = contains(local.nat_functions, each.key) ? var.nat_subnet_ids : var.db_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = merge(
      {
        DB_SECRET_ARN     = aws_rds_cluster.this.master_user_secret[0].secret_arn
        DB_PROXY_ENDPOINT = aws_db_proxy.this.endpoint
        DB_NAME           = var.db_name
      },
      contains(local.needs_tl_secret, each.key) ? {
        TL_API_KEY_SECRET_ARN = aws_secretsmanager_secret.tl_api_key.arn
        TL_API_BASE_URL       = var.tl_api_base_url
        TL_INDEX_ID           = var.tl_index_id
      } : {}
    )
  }

  depends_on = [
    aws_cloudwatch_log_group.function,
    aws_iam_role_policy_attachment.function_basic,
    aws_iam_role_policy_attachment.function_vpc,
  ]
}

# --- LogDuplicateSkip (SPEC.md 3.1 step 2, "Yes" branch) ----------------
# No dependencies, no DB/S3 access needed - kept out of the generic for_each.

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
