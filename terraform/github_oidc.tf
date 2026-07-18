# GitHub Actions -> AWS federation: lets a workflow run `terraform apply`
# using short-lived credentials from GitHub's OIDC token instead of a static
# AWS access key stored as a repo secret.

variable "github_repo" {
  type        = string
  default     = "vaidee/ads"
  description = "GitHub \"owner/repo\" allowed to assume the deploy role."
}

variable "github_oidc_subjects" {
  type = list(string)
  default = [
    "repo:vaidee/ads:ref:refs/heads/main",
    "repo:vaidee/ads:pull_request",
    # A job that sets `environment:` (the apply job's aws-deploy gate, and
    # the destroy job's aws-destroy gate, in .github/workflows/terraform.yml)
    # gets an OIDC token with THIS sub form instead of the
    # ref:refs/heads/... form above - easy to miss, since the plan job (no
    # environment:) works fine without it and masks the gap. Missing the
    # aws-destroy entry here is exactly what caused destroy's "Not
    # authorized to perform sts:AssumeRoleWithWebIdentity" - same gotcha,
    # just not extended to the second environment when it was added.
    "repo:vaidee/ads:environment:aws-deploy",
    "repo:vaidee/ads:environment:aws-destroy",
  ]
  description = <<-EOT
    Allowed values of the OIDC token's `sub` claim, matched with StringLike.
    Defaults to "push to main", "any pull_request", and the aws-deploy/
    aws-destroy environments - broaden this (e.g. add
    "repo:OWNER/REPO:ref:refs/heads/*") if other branches need to deploy too.
    See https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#understanding-the-oidc-token
  EOT
}

variable "tf_state_bucket" {
  type        = string
  default     = "ads-statefile-store"
  description = "S3 bucket holding Terraform state - must match versions.tf's backend config (see backend.hcl.example)."
}

variable "tf_state_dynamodb_table" {
  type        = string
  default     = "ads-state-lock-table"
  description = "DynamoDB table used for state locking - must match versions.tf's backend config."
}

variable "tf_state_region" {
  type        = string
  default     = "ap-southeast-1"
  description = "Region the state bucket/table live in - must match versions.tf's backend config."
}

data "aws_caller_identity" "current" {}

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = var.github_oidc_subjects
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name                 = "${var.name_prefix}-github-actions-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_actions_assume_role.json
  max_session_duration = 3600
}

# Scoped to the AWS services this stack actually manages (Lambda, RDS/Proxy,
# API Gateway, Cognito, EventBridge, Step Functions, Secrets Manager, the VPC
# read/security-group calls Aurora needs, S3 bucket-notification config, plus
# IAM to manage the roles/policies Terraform creates for all of the above) -
# not AdministratorAccess. Read-only two-way trust: this role can also manage
# its own OIDC provider/role, since that's what let it be created by
# `terraform apply` under this same role once bootstrapped by hand once.
data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid       = "TerraformStateObjects"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["arn:aws:s3:::${var.tf_state_bucket}/*"]
  }
  statement {
    sid       = "TerraformStateBucketList"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.tf_state_bucket}"]
  }
  statement {
    sid     = "TerraformStateLock"
    actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [
      "arn:aws:dynamodb:${var.tf_state_region}:${data.aws_caller_identity.current.account_id}:table/${var.tf_state_dynamodb_table}"
    ]
  }

  statement {
    sid       = "Lambda"
    actions   = ["lambda:*"]
    resources = ["*"]
  }
  statement {
    sid       = "RdsAndProxy"
    actions   = ["rds:*"]
    resources = ["*"]
  }
  statement {
    sid       = "SecretsManager"
    actions   = ["secretsmanager:*"]
    resources = ["*"]
  }
  statement {
    sid       = "ApiGateway"
    actions   = ["apigateway:*"]
    resources = ["*"]
  }
  statement {
    sid       = "Cognito"
    actions   = ["cognito-idp:*"]
    resources = ["*"]
  }
  statement {
    sid       = "EventsAndSchedules"
    actions   = ["events:*", "scheduler:*"]
    resources = ["*"]
  }
  statement {
    sid       = "StepFunctions"
    actions   = ["states:*"]
    resources = ["*"]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:*"]
    resources = ["*"]
  }
  statement {
    sid = "Ec2ReadAndSecurityGroups"
    actions = [
      "ec2:Describe*",
      "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup",
      "ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress",
      "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupEgress",
      "ec2:CreateTags", "ec2:DeleteTags",
    ]
    resources = ["*"]
  }
  statement {
    # s3:ListBucket is what actually authorizes the HeadBucket call behind the
    # aws_s3_bucket data source (eventbridge.tf) - without it the AWS provider
    # surfaces a confusing "empty result" error rather than an access-denied one.
    #
    # NOTE: the IAM action is "PutBucketNotification" (no "Configuration"
    # suffix) even though the actual S3 API operation it authorizes is called
    # PutBucketNotificationConfiguration - one of AWS's action-name/API-name
    # mismatches. Same for GetBucketNotification.
    sid = "S3BucketNotification"
    actions = [
      "s3:GetBucketNotification", "s3:PutBucketNotification",
      "s3:GetBucketLocation", "s3:ListBucket",
    ]
    resources = ["arn:aws:s3:::${var.ingest_bucket_name}"]
  }
  statement {
    # For aws_s3_bucket_cors_configuration.ingest (eventbridge.tf) - the UI
    # uploads to and streams from this bucket directly from the browser.
    sid       = "S3BucketCors"
    actions   = ["s3:GetBucketCORS", "s3:PutBucketCORS"]
    resources = ["arn:aws:s3:::${var.ingest_bucket_name}"]
  }
  statement {
    # RDS's storage_encrypted + manage_master_user_password both need to use
    # the account's default AWS-managed KMS keys (aws/rds, aws/secretsmanager)
    # - even for the default key, the calling principal still needs its own
    # identity-based KMS permissions, not just the key's resource policy.
    # Also covers full lifecycle management of the customer-managed key +
    # alias in rds_backup.tf (CreateKey/CreateAlias and friends were missing
    # here initially - the original set only covered *using* an existing
    # key, not creating a new one, which is exactly what a first `terraform
    # apply` of rds_backup.tf needs to do).
    sid = "Kms"
    actions = [
      "kms:DescribeKey", "kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant", "kms:RetireGrant",
      "kms:Decrypt", "kms:GenerateDataKey", "kms:GenerateDataKeyWithoutPlaintext",
      "kms:ListAliases", "kms:ListKeys",
      "kms:CreateKey", "kms:TagResource", "kms:UntagResource", "kms:ListResourceTags",
      "kms:PutKeyPolicy", "kms:GetKeyPolicy", "kms:EnableKeyRotation", "kms:GetKeyRotationStatus",
      "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion",
      "kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "Iam"
    actions   = ["iam:*"]
    resources = ["*"]
  }
  statement {
    # Scoped to just the UI's own bucket (web.tf) - full control since
    # Terraform owns this bucket outright (create/policy/sync/etc.), unlike
    # the ingest bucket which pre-exists and is only partially managed here.
    sid       = "WebBucket"
    actions   = ["s3:*"]
    resources = ["arn:aws:s3:::${var.name_prefix}-web-*", "arn:aws:s3:::${var.name_prefix}-web-*/*"]
  }
  statement {
    sid       = "CloudFront"
    actions   = ["cloudfront:*"]
    resources = ["*"]
  }
  statement {
    sid       = "Sts"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "${var.name_prefix}-github-actions-deploy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}

# These three resources ARE the trust chain that every CI job - including the
# destroy job's own `terraform destroy` - authenticates with. Never let an
# automated `terraform destroy` touch them: AWS invalidates a role's
# temporary STS credentials the instant the role/its OIDC trust is deleted,
# even mid-TTL, so if `terraform destroy` reaches these before it's finished
# destroying everything else (and before its final state-upload PutObject to
# S3), every subsequent AWS call - including that state upload - starts
# failing with InvalidClientTokenId/InvalidAccessKeyId. That's a real
# incident that happened here: the destroy job deleted these, then couldn't
# confirm the RDS instance/proxy had finished deleting, couldn't persist the
# updated state to S3, and left CI itself unable to authenticate for any
# future run. See .github/workflows/terraform.yml's destroy job, which
# excludes these from `terraform destroy` the same way rds_backup.tf's KMS
# key is excluded (`terraform state rm` before, `terraform import` after) -
# these outputs exist so that job can capture stable import identifiers
# while they're still in state, before detaching them.
output "github_actions_role_name" {
  value = aws_iam_role.github_actions_deploy.name
}

output "github_actions_role_policy_import_id" {
  # aws_iam_role_policy's import ID format is "role_name:policy_name".
  value = "${aws_iam_role.github_actions_deploy.name}:${aws_iam_role_policy.github_actions_deploy.name}"
}

output "github_actions_oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github_actions.arn
}
