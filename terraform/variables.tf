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
