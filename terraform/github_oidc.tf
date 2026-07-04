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
  ]
  description = <<-EOT
    Allowed values of the OIDC token's `sub` claim, matched with StringLike.
    Defaults to "push to main" and "any pull_request" - broaden this (e.g. add
    "repo:OWNER/REPO:ref:refs/heads/*") if other branches need to deploy too.
    See https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#understanding-the-oidc-token
  EOT
}

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
    sid = "TerraformState"
    actions = [
      "s3:GetObject", "s3:PutObject", "s3:ListBucket",
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem",
    ]
    resources = ["*"] # tighten to the specific state bucket/table once one exists (see README note below)
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
    sid       = "S3BucketNotification"
    actions   = ["s3:GetBucketNotification", "s3:PutBucketNotificationConfiguration", "s3:GetBucketLocation"]
    resources = ["*"]
  }
  statement {
    sid       = "Iam"
    actions   = ["iam:*"]
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
