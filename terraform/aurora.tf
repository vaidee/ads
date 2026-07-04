# Aurora Serverless v2 (PostgreSQL) + RDS Proxy, in the existing VPC passed via
# var.vpc_id / var.aurora_subnet_ids. schema.sql is NOT applied automatically here:
# the cluster lives in private subnets, so `npm run migrate` (db/migrate.js) needs
# to be run from something with network access to it - a bastion, an SSM Session
# Manager port-forward, or a one-off Lambda - after this stack is applied. Use the
# aurora_cluster_endpoint and aurora_master_user_secret_arn outputs below.

resource "aws_db_subnet_group" "aurora" {
  name       = "${var.name_prefix}-aurora"
  subnet_ids = var.aurora_subnet_ids
}

resource "aws_security_group" "aurora" {
  name        = "${var.name_prefix}-aurora"
  description = "Aurora cluster + RDS Proxy - Postgres access from the ingestion Lambdas"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Lambda -> RDS Proxy
resource "aws_security_group_rule" "aurora_ingress_from_lambda" {
  for_each                 = toset(var.vpc_security_group_ids)
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.aurora.id
  source_security_group_id = each.value
}

# RDS Proxy -> Aurora cluster (both sit in this same security group)
resource "aws_security_group_rule" "aurora_ingress_self" {
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  security_group_id = aws_security_group.aurora.id
  self              = true
}

resource "aws_rds_cluster" "this" {
  cluster_identifier = "${var.name_prefix}-aurora"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned" # required for Serverless v2
  engine_version     = var.aurora_engine_version
  database_name      = var.db_name
  master_username    = var.db_master_username

  # AWS creates and rotates a Secrets Manager secret for the master user instead
  # of a password living in Terraform state/config.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  storage_encrypted      = true
  skip_final_snapshot    = var.skip_final_snapshot

  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_capacity
    max_capacity = var.aurora_max_capacity
  }
}

resource "aws_rds_cluster_instance" "writer" {
  cluster_identifier = aws_rds_cluster.this.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.this.engine
  engine_version     = aws_rds_cluster.this.engine_version
}

# --- RDS Proxy ------------------------------------------------------------
# Lambdas connect through this, not the cluster endpoint directly, so warm
# invocations reuse pooled connections (see functions/shared/db.js).

data "aws_iam_policy_document" "rds_proxy_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_proxy" {
  name               = "${var.name_prefix}-rds-proxy"
  assume_role_policy = data.aws_iam_policy_document.rds_proxy_assume_role.json
}

data "aws_iam_policy_document" "rds_proxy_secret_access" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_rds_cluster.this.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "rds_proxy_secret_access" {
  name   = "${var.name_prefix}-rds-proxy-secret-access"
  role   = aws_iam_role.rds_proxy.id
  policy = data.aws_iam_policy_document.rds_proxy_secret_access.json
}

resource "aws_db_proxy" "this" {
  name                   = "${var.name_prefix}-proxy"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_subnet_ids         = var.aurora_subnet_ids
  vpc_security_group_ids = [aws_security_group.aurora.id]
  require_tls            = true

  auth {
    auth_scheme = "SECRETS"
    secret_arn  = aws_rds_cluster.this.master_user_secret[0].secret_arn
    iam_auth    = "DISABLED"
  }
}

resource "aws_db_proxy_default_target_group" "this" {
  db_proxy_name = aws_db_proxy.this.name

  connection_pool_config {
    max_connections_percent = 100
  }
}

resource "aws_db_proxy_target" "this" {
  db_proxy_name         = aws_db_proxy.this.name
  target_group_name     = aws_db_proxy_default_target_group.this.name
  db_cluster_identifier = aws_rds_cluster.this.cluster_identifier
}
