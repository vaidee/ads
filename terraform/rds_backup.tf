# KMS key + IAM role for exporting an Aurora snapshot to S3 as part of a
# full teardown (see .github/workflows/terraform.yml's destroy job).
# Reuses the existing Terraform state bucket (var.tf_state_bucket) as the
# export destination, under a dedicated prefix, rather than provisioning a
# new bucket - avoids needing a whole new s3:CreateBucket grant, and that
# bucket already exists outside this Terraform run (same "existing,
# referenced by variable, not created here" pattern as var.ingest_bucket_name).
#
# The KMS key is deliberately detached from Terraform state
# (`terraform state rm`) right before the destroy job runs
# `terraform destroy`, so it - and the backup encrypted with it - survives
# even though the rest of the stack gets torn down. Losing this key would
# make the exported files permanently unreadable even though they're still
# sitting in S3. The export IAM role doesn't need to survive (only needed
# during the export itself, not to read the backup back later), so it's
# destroyed normally along with everything else.
#
# The same destroy job re-imports the key back into state right after
# `terraform destroy` finishes, so the state file always ends a teardown in
# a self-consistent condition - the next `terraform apply` (a fresh
# stand-up) sees it as already-existing/unchanged and builds everything
# else around it, rather than failing with "already exists".
#
# NOTE: AWS requires the export destination bucket to be in the same region
# as the source snapshot. Confirm var.tf_state_region matches the region
# this stack's other resources actually deploy into (vars.AWS_REGION in
# .github/workflows/terraform.yml) - if they differ, the export step in the
# destroy job will fail.

locals {
  rds_backup_s3_prefix = "rds-backups/"
}

resource "aws_kms_key" "rds_backup" {
  description             = "Encrypts the Aurora snapshot export to S3 - RDS requires a customer-managed key for this; the AWS-managed default key isn't allowed."
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "rds_backup" {
  name          = "alias/${var.name_prefix}-rds-backup"
  target_key_id = aws_kms_key.rds_backup.key_id
}

# The service performing the export (not the CI role) assumes this - RDS
# itself writes to S3 on the export task's behalf.
data "aws_iam_policy_document" "rds_export_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["export.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_export" {
  name               = "${var.name_prefix}-rds-export"
  assume_role_policy = data.aws_iam_policy_document.rds_export_assume_role.json
}

data "aws_iam_policy_document" "rds_export" {
  statement {
    # Scoped to just the backup prefix within the state bucket, not the
    # whole bucket - this role has no business touching the actual .tfstate
    # objects living alongside it.
    actions = [
      "s3:PutObject", "s3:PutObjectAcl", "s3:GetObject", "s3:DeleteObject",
    ]
    resources = ["arn:aws:s3:::${var.tf_state_bucket}/${local.rds_backup_s3_prefix}*"]
  }
  statement {
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = ["arn:aws:s3:::${var.tf_state_bucket}"]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.rds_backup_s3_prefix}*"]
    }
  }
  statement {
    # The export role itself (not just the calling CI identity) needs to use
    # the key to encrypt the exported files - scoped to just this key, per
    # AWS's documented IAM policy shape for snapshot-export-to-S3.
    actions   = ["kms:DescribeKey", "kms:CreateGrant", "kms:GenerateDataKey", "kms:Decrypt"]
    resources = [aws_kms_key.rds_backup.arn]
  }
}

resource "aws_iam_role_policy" "rds_export" {
  name   = "${var.name_prefix}-rds-export"
  role   = aws_iam_role.rds_export.id
  policy = data.aws_iam_policy_document.rds_export.json
}

output "rds_backup_bucket_name" {
  value = var.tf_state_bucket
}

output "rds_backup_s3_prefix" {
  value = local.rds_backup_s3_prefix
}

output "rds_export_role_arn" {
  value = aws_iam_role.rds_export.arn
}

output "rds_backup_kms_key_id" {
  value = aws_kms_key.rds_backup.key_id
}

output "rds_backup_kms_alias_name" {
  value = aws_kms_alias.rds_backup.name
}
