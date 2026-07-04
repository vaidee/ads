# FR-16: "a small set of Cognito-managed user logins" - no self-signup UI is
# built, so the small set of reviewer accounts is provisioned out-of-band via
# `aws cognito-idp admin-create-user`, the same "managed by hand for now"
# pattern SPEC.md already uses for compliance_rules.

resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-users"

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  auto_verified_attributes = ["email"]

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  # USER_PASSWORD_AUTH: the UI calls Cognito's InitiateAuth directly with a
  # username/password, no hosted-UI OAuth redirect - simplest login flow for a
  # small internal reviewer tool.
  explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  generate_secret     = false

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}
