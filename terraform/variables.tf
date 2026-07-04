variable "name_prefix" {
  type        = string
  default     = "ads-ingest"
  description = "Prefix applied to resource names created by this module."
}

variable "ingest_bucket_name" {
  type        = string
  description = "Existing S3 bucket watched for ad video drops (automated) and UI uploads (both fire the same S3 event). This module enables EventBridge notifications on it but does not create it."
}

variable "db_name" {
  type    = string
  default = "ads"
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC that Aurora, the RDS Proxy, and the TriggerIngest Lambda are deployed into."
}

variable "aurora_subnet_ids" {
  type        = list(string)
  description = "Subnets the Aurora cluster + RDS Proxy already live in. Deliberately left separate from db_subnet_ids/nat_subnet_ids below and never changed by the Tier A/B split: RDS refuses to drop a subnet from a DB subnet group while a running instance's ENI is still in it (that needs an instance recreation to fix), and Aurora/the Proxy never need a NAT/internet route anyway - intra-VPC traffic (Lambda -> Proxy -> Aurora) uses the VPC's automatic local route regardless of subnet tier, so there's no reason to migrate them."
}

variable "db_subnet_ids" {
  type        = list(string)
  description = "Private subnets (in var.vpc_id) with NO route to the internet/NAT - only a route to the S3 Gateway Endpoint and (via the Secrets Manager Interface Endpoint's Private DNS) Secrets Manager. Used for every Lambda that doesn't call TwelveLabs (trigger-ingest, parse-and-persist, apply-suggestion-logic, persist-final, handle-pipeline-error, weekly-eval)."
}

variable "nat_subnet_ids" {
  type        = list(string)
  description = "Private subnets (in var.vpc_id) that route 0.0.0.0/0 through a NAT Gateway. Used only by the Lambdas that call TwelveLabs over the public internet: index-video, check-indexing-status, run-compliance-analysis, and api (semantic-search fallback)."
}

variable "vpc_security_group_ids" {
  type        = list(string)
  description = "Security group attached to every pipeline/api Lambda's ENIs, regardless of subnet tier. Granted ingress to the Aurora/RDS Proxy security group on port 5432, and must also be allowed inbound 443 on the Secrets Manager VPC endpoint's security group."
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "aurora_engine_version" {
  type        = string
  default     = "16.4"
  description = "Aurora PostgreSQL engine version. Must be a version that currently supports Serverless v2 in your region/account - check before applying, as AWS periodically deprecates minor versions."
}

variable "aurora_min_capacity" {
  type    = number
  default = 0.5
}

variable "aurora_max_capacity" {
  type    = number
  default = 4
}

variable "db_master_username" {
  type        = string
  default     = "ads_app"
  description = "Aurora master username. v1 has the Lambdas connect with these credentials directly (via RDS Proxy) rather than a separate least-privilege app role - tighten this later if needed."
}

variable "skip_final_snapshot" {
  type        = bool
  default     = true
  description = "Set to false for production so a final snapshot is taken on destroy/replace."
}

variable "api_routes" {
  type = list(string)
  default = [
    "GET /ads",
    "GET /ads/search",
    "GET /ads/export",
    "GET /ads/{id}",
    "POST /ads/{id}/approve",
    "POST /ads/{id}/reject",
    "POST /ads/{id}/sendback",
    "POST /ads/{id}/reprocess",
    "POST /ads/{id}/comments",
    "POST /ads/{id}/publish",
    "POST /ads/upload-url",
    "GET /eval/weekly",
  ]
  description = "SPEC.md section 6 routes, all proxied to the single api Lambda."
}

variable "cors_allow_origins" {
  type        = list(string)
  default     = ["*"]
  description = "Used for both API Gateway's CORS config and the ingest bucket's CORS config (eventbridge.tf) - the UI calls both directly from the browser. Restrict this to the UI's actual origin(s) once known (see the web_url output, e.g. https://dXXXXXXXXXXXXX.cloudfront.net) - \"*\" is a dev-friendly default, not a production one."
}

variable "weekly_eval_schedule_expression" {
  type        = string
  default     = "cron(0 6 ? * MON *)"
  description = "SPEC.md section 8.1 - runs Monday mornings and evaluates the just-completed Mon-Sun week."
}
