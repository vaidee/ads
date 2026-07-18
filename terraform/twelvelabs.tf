# TwelveLabs is a third-party SaaS - Terraform's AWS provider can't create an
# index or an API key there. This just gives the AWS-side resources (a secret
# to hold the key) that the Lambdas need; you still have to create the index
# and API key in the TwelveLabs console/API yourself and pass them in below.

variable "tl_api_key" {
  type        = string
  sensitive   = true
  description = "TwelveLabs API key. Stored in Secrets Manager by this stack; the value must be supplied at apply time."
}

variable "tl_index_id" {
  type        = string
  description = "TwelveLabs index id, created out-of-band. NFR-1: one persistent index is reused for every video, not one index per video."
}

variable "tl_api_base_url" {
  type    = string
  default = "https://api.twelvelabs.io/v1.3"
}

resource "aws_secretsmanager_secret" "tl_api_key" {
  name = "${var.name_prefix}-tl-api-key"
  # Without this, deleting the secret (a normal `terraform destroy`, not
  # just the teardown workflow) only schedules it for deletion - AWS keeps
  # it in a recovery window (30 days by default) during which the name is
  # reserved and a fresh `aws_secretsmanager_secret` with the same name
  # fails to create with "already scheduled for deletion". This secret just
  # mirrors a value supplied fresh at every apply (TF_VAR_tl_api_key, from a
  # GitHub Actions secret) - there's nothing here that recovery would ever
  # be needed for, so skip the window and let re-create-after-destroy work
  # immediately.
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "tl_api_key" {
  secret_id     = aws_secretsmanager_secret.tl_api_key.id
  secret_string = var.tl_api_key
}
