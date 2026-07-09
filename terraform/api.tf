# The "api" Lambda is kept separate from the generic pipeline for_each in
# lambda.tf (see locals.tf) because it needs to reference the state machine's
# ARN, and the state machine's own definition references the pipeline Lambdas -
# unifying them would create a dependency cycle.

resource "null_resource" "build_api" {
  triggers = {
    functions_hash = sha1(join("", [
      for f in fileset("${path.module}/../functions", "**/*.js") :
      filesha256("${path.module}/../functions/${f}")
    ]))
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild functions/api/index.js --bundle --platform=node --target=node20 --external:@aws-sdk/* --outfile=terraform/dist/api/index.js"
  }
}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/dist/api"
  output_path = "${path.module}/dist/api.zip"
  depends_on  = [null_resource.build_api]
}

resource "aws_iam_role" "api" {
  name               = "${var.name_prefix}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "api_basic" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "api_vpc" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "api_inline" {
  statement {
    sid       = "ReadDbSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_rds_cluster.this.master_user_secret[0].secret_arn, aws_secretsmanager_secret.tl_api_key.arn]
  }
  statement {
    sid       = "ReadWriteIngestBucket"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["arn:aws:s3:::${var.ingest_bucket_name}/*"]
  }
  statement {
    sid       = "StartReprocessExecution"
    actions   = ["states:StartExecution"]
    resources = [aws_sfn_state_machine.ingest_pipeline.arn]
  }
  statement {
    # v3 status redesign: POST /ads/{id}/approve asynchronously invokes this
    # instead of waiting on it inline - see functions/shared/lambdaInvoker.js.
    sid       = "InvokePlatformCompliance"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.bundled["run-platform-compliance"].arn]
  }
}

resource "aws_iam_role_policy" "api_inline" {
  name   = "${var.name_prefix}-api-inline"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_inline.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name_prefix}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.name_prefix}-api"
  role             = aws_iam_role.api.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  vpc_config {
    # NAT-routed (Tier B): the semantic-search fallback route calls TwelveLabs
    # directly, same as index-video/check-indexing-status/run-compliance-analysis.
    subnet_ids         = var.nat_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = {
      DB_SECRET_ARN         = aws_rds_cluster.this.master_user_secret[0].secret_arn
      DB_PROXY_ENDPOINT     = aws_db_proxy.this.endpoint
      DB_NAME               = var.db_name
      TL_API_KEY_SECRET_ARN = aws_secretsmanager_secret.tl_api_key.arn
      TL_API_BASE_URL       = var.tl_api_base_url
      TL_INDEX_ID           = var.tl_index_id
      STATE_MACHINE_ARN     = aws_sfn_state_machine.ingest_pipeline.arn
      INGEST_BUCKET_NAME    = var.ingest_bucket_name
      # SPEC_v2 V2-2: POST /ads/{id}/publish invokes this asynchronously.
      RUN_PLATFORM_COMPLIANCE_FUNCTION_NAME = aws_lambda_function.bundled["run-platform-compliance"].function_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy_attachment.api_basic,
    aws_iam_role_policy_attachment.api_vpc,
  ]
}

# --- API Gateway HTTP API + Cognito JWT authorizer (SPEC.md section 6) -------

data "aws_region" "current" {}

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allow_origins
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
  }
}

resource "aws_cloudwatch_log_group" "api_access_logs" {
  name              = "/aws/apigateway/${var.name_prefix}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access_logs.arn
    format = jsonencode({
      requestId    = "$context.requestId"
      routeKey     = "$context.routeKey"
      status       = "$context.status"
      errorMessage = "$context.error.message"
    })
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.name_prefix}-cognito-jwt"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}"
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api" {
  for_each = toset(var.api_routes)

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
