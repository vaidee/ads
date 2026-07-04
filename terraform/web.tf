# S3 + CloudFront static hosting for web/ (SPEC.md section 7). The UI is a
# pure client - all business logic goes through the API Gateway/Lambda
# backend or straight to S3 (video streaming, uploads) - so there's nothing
# here beyond serving the built static assets behind a CDN.

variable "web_price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class - PriceClass_100 (US/Canada/Europe only) is cheapest and plenty for an internal reviewer tool."
}

resource "aws_s3_bucket" "web" {
  # Bucket names are globally unique across all AWS accounts - suffixed with
  # the account id for the same reason the ingest bucket has one baked in.
  bucket = "${var.name_prefix}-web-${data.aws_caller_identity.current.account_id}"

  # Explicit ordering: this resource and the CloudFront OAC below need the
  # WebBucket/CloudFront statements added to the deploy role's policy
  # (github_oidc.tf) in the SAME apply that first creates them. Without this,
  # Terraform has no dependency edge between an unrelated IAM policy resource
  # and these, so it can (and did) try to create them before the policy
  # granting permission for that was actually applied.
  depends_on = [aws_iam_role_policy.github_actions_deploy]
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name_prefix}-web-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"

  depends_on = [aws_iam_role_policy.github_actions_deploy]
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = var.web_price_class
  comment             = "${var.name_prefix} UI"

  # Skip waiting for full global propagation (can take 10-15+ min) so
  # `terraform apply` doesn't stall CI on every UI deploy - the distribution
  # still gets created either way, DNS just catches up shortly after.
  wait_for_deployment = false

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "web-s3"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # AWS managed "CachingOptimized"
  }

  # React Router uses real paths (e.g. /ads/abc123) that don't exist as S3
  # objects - remap S3's 403/404 (private bucket denies unknown keys with
  # 403, not 404) back to index.html so client-side routing can take over.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "web_bucket_policy" {
  statement {
    sid       = "AllowCloudFrontReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket_policy.json
}

# Builds the Vite app with the live backend endpoints baked in, then syncs it
# to S3 and invalidates CloudFront - mirrors the esbuild null_resource pattern
# already used for the Lambdas (build.tf).
resource "null_resource" "build_web" {
  triggers = {
    web_hash = sha1(join("", [
      for f in setunion(
        fileset("${path.module}/../web", "src/**"),
        fileset("${path.module}/../web", "*.json"),
        fileset("${path.module}/../web", "*.js"),
        fileset("${path.module}/../web", "*.html"),
      ) : filesha256("${path.module}/../web/${f}")
    ]))
    api_endpoint   = aws_apigatewayv2_stage.default.invoke_url
    cognito_client = aws_cognito_user_pool_client.web.id
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/../web"
    command     = "npm install --no-audit --no-fund && npm run build"
    environment = {
      VITE_API_BASE_URL      = aws_apigatewayv2_stage.default.invoke_url
      VITE_AWS_REGION        = data.aws_region.current.name
      VITE_COGNITO_CLIENT_ID = aws_cognito_user_pool_client.web.id
    }
  }
}

resource "null_resource" "deploy_web" {
  triggers = {
    build_id = null_resource.build_web.id
  }

  provisioner "local-exec" {
    command = <<-EOT
      aws s3 sync ${path.module}/../web/dist s3://${aws_s3_bucket.web.id} --delete \
        --cache-control "public,max-age=31536000,immutable" --exclude index.html
      aws s3 cp ${path.module}/../web/dist/index.html s3://${aws_s3_bucket.web.id}/index.html \
        --cache-control "no-cache"
      aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.web.id} --paths "/*"
    EOT
  }

  depends_on = [null_resource.build_web, aws_s3_bucket_policy.web]
}

output "web_url" {
  value = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "web_bucket_name" {
  value = aws_s3_bucket.web.id
}
