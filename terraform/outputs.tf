output "state_machine_arn" {
  value = aws_sfn_state_machine.ingest_pipeline.arn
}

output "trigger_ingest_function_arn" {
  value = aws_lambda_function.trigger_ingest.arn
}

output "log_duplicate_skip_function_arn" {
  value = aws_lambda_function.log_duplicate_skip.arn
}
