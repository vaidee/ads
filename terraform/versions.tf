terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      # >= 5.27 for the "db.serverless" instance class (Aurora Serverless v2)
      version = ">= 5.27, < 6.0.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {}
