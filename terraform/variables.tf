variable "name_prefix" {
  type        = string
  default     = "ads-ingest"
  description = "Prefix applied to resource names created by this module."
}

variable "ingest_bucket_name" {
  type        = string
  description = "Existing S3 bucket watched for ad video drops (automated) and UI uploads (both fire the same S3 event). This module enables EventBridge notifications on it but does not create it."
}

variable "db_secret_arn" {
  type        = string
  description = "Secrets Manager ARN holding the Aurora app role credentials (username/password), used to authenticate through RDS Proxy."
}

variable "db_proxy_endpoint" {
  type        = string
  description = "RDS Proxy endpoint the Lambdas connect through to reach Aurora Postgres."
}

variable "db_name" {
  type    = string
  default = "ads"
}

variable "vpc_subnet_ids" {
  type        = list(string)
  description = "Private subnets with a route to the RDS Proxy and (via NAT or VPC endpoints) to S3/Secrets Manager."
}

variable "vpc_security_group_ids" {
  type        = list(string)
  description = "Security groups attached to the TriggerIngest Lambda's ENIs."
}

variable "log_retention_days" {
  type    = number
  default = 30
}
