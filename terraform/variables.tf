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

variable "vpc_subnet_ids" {
  type        = list(string)
  description = "Private subnets (in var.vpc_id) with a route to S3/Secrets Manager (via NAT or VPC endpoints). Used for the TriggerIngest Lambda, the Aurora DB subnet group, and the RDS Proxy."
}

variable "vpc_security_group_ids" {
  type        = list(string)
  description = "Security groups attached to the TriggerIngest Lambda's ENIs. Granted ingress to the Aurora/RDS Proxy security group on port 5432."
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
  description = "Restrict this to the UI's actual origin(s) once known - \"*\" is a dev-friendly default, not a production one."
}

variable "weekly_eval_schedule_expression" {
  type        = string
  default     = "cron(0 6 ? * MON *)"
  description = "SPEC.md section 8.1 - runs Monday mornings and evaluates the just-completed Mon-Sun week."
}
