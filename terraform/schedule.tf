# SPEC.md section 8.1: weekly EventBridge-scheduled passive evaluation.

resource "aws_cloudwatch_event_rule" "weekly_eval" {
  name                = "${var.name_prefix}-weekly-eval"
  schedule_expression = var.weekly_eval_schedule_expression
}

resource "aws_cloudwatch_event_target" "weekly_eval" {
  rule = aws_cloudwatch_event_rule.weekly_eval.name
  arn  = aws_lambda_function.bundled["weekly-eval"].arn
}

resource "aws_lambda_permission" "weekly_eval_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bundled["weekly-eval"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_eval.arn
}
