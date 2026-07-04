output "state_machine_arn" {
  value = aws_sfn_state_machine.ingest_pipeline.arn
}

output "trigger_ingest_function_arn" {
  value = aws_lambda_function.bundled["trigger-ingest"].arn
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

output "api_endpoint" {
  description = "Base URL the UI calls - API Gateway HTTP API's auto-generated $default stage invoke URL."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "tl_api_key_secret_arn" {
  description = "Update this secret's value in Secrets Manager (or re-apply with a new tl_api_key) if the TwelveLabs key rotates."
  value       = aws_secretsmanager_secret.tl_api_key.arn
}

output "github_actions_deploy_role_arn" {
  description = "Put this in the repo's AWS_DEPLOY_ROLE_ARN variable (Settings > Secrets and variables > Actions) for .github/workflows/terraform.yml to assume."
  value       = aws_iam_role.github_actions_deploy.arn
}
