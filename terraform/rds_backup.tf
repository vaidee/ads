# Dedicated bucket + KMS key + IAM role for exporting an Aurora snapshot to
# S3 as part of a full teardown (see .github/workflows/terraform.yml's
# destroy job). Both the bucket and the key are deliberately detached from
# Terraform state (`terraform state rm`) right before that job runs
# `terraform destroy`, so they - and the backup they hold - survive even
# though the rest of the stack gets torn down. The export IAM role doesn't
# need to survive (only needed during the export itself, not to read the
# data back later), so it's destroyed normally along with everything else.
#
# The same destroy job re-imports the bucket/key back into state right
# after `terraform destroy` finishes, so the state file always ends a
# teardown in a self-consistent condition - the next `terraform apply`
# (a fresh stand-up) sees them as already-existing/unchanged and builds
# everything else around them, rather than failing with "already exists".

resource "aws_kms_key" "rds_backup" {
  description             = "Encrypts the Aurora snapshot export to S3 - RDS requires a customer-managed key for this; the AWS-managed default key isn't allowed."
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "rds_backup" {
  name          = "alias/${var.name_prefix}-rds-backup"
  target_key_id = aws_kms_key.rds_backup.key_id
}

resource "aws_s3_bucket" "rds_backup" {
  bucket = "${var.name_prefix}-rds-backup-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "rds_backup" {
  bucket                  = aws_s3_bucket.rds_backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
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
    actions = [
      "s3:PutObject", "s3:PutObjectAcl", "s3:GetObject", "s3:ListBucket",
      "s3:GetBucketLocation", "s3:DeleteObject",
    ]
    resources = [aws_s3_bucket.rds_backup.arn, "${aws_s3_bucket.rds_backup.arn}/*"]
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
  value = aws_s3_bucket.rds_backup.id
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
