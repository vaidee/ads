data "aws_iam_policy_document" "sfn_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "state_machine" {
  name               = "${var.name_prefix}-state-machine"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume_role.json
}

data "aws_iam_policy_document" "state_machine_invoke" {
  statement {
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.trigger_ingest.arn,
      aws_lambda_function.log_duplicate_skip.arn,
    ]
  }
}

resource "aws_iam_role_policy" "state_machine_invoke" {
  name   = "${var.name_prefix}-state-machine-invoke"
  role   = aws_iam_role.state_machine.id
  policy = data.aws_iam_policy_document.state_machine_invoke.json
}

# Reuses statemachine/pipeline.asl.json as-is: its ${...} placeholders are plain
# Terraform templatefile syntax, so this is the same definition SAM deploys.
resource "aws_sfn_state_machine" "ingest_pipeline" {
  name     = "${var.name_prefix}-pipeline"
  role_arn = aws_iam_role.state_machine.arn

  definition = templatefile("${path.module}/../statemachine/pipeline.asl.json", {
    TriggerIngestFunctionArn    = aws_lambda_function.trigger_ingest.arn
    LogDuplicateSkipFunctionArn = aws_lambda_function.log_duplicate_skip.arn
  })
}
