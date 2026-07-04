terraform {
  required_version = ">= 1.5"

  # Bucket/table/region can't be variables in a backend block, and they differ
  # per user/environment, so this is intentionally left partial - run
  # `terraform init -backend-config=backend.hcl` (see backend.hcl.example) or
  # pass -backend-config="bucket=..." flags directly. CI does the latter (see
  # .github/workflows/terraform.yml).
  backend "s3" {}

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # >= 5.27 for the "db.serverless" instance class (Aurora Serverless v2)
      version = ">= 5.27, < 6.0.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "aws" {}
