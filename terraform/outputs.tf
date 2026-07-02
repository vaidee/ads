output "state_machine_arn" {
  value = aws_sfn_state_machine.ingest_pipeline.arn
}

output "trigger_ingest_function_arn" {
  value = aws_lambda_function.trigger_ingest.arn
}

output "log_duplicate_skip_function_arn" {
  value = aws_lambda_function.log_duplicate_skip.arn
}

output "aurora_cluster_endpoint" {
  description = "Writer endpoint - used to run db/migrate.js from within the VPC (bastion / SSM port-forward / one-off Lambda)."
  value       = aws_rds_cluster.this.endpoint
}

output "aurora_master_user_secret_arn" {
  description = "Secrets Manager ARN for the Aurora master user credentials, managed by AWS (manage_master_user_password = true)."
  value       = aws_rds_cluster.this.master_user_secret[0].secret_arn
}

output "db_proxy_endpoint" {
  value = aws_db_proxy.this.endpoint
}
