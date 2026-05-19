resource "aws_cognito_user_pool" "mcp_proxy" {
  count = var.enable_cognito ? 1 : 0

  name = "backlog-mcp-proxy"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }
}

resource "aws_cognito_user_pool_client" "mcp_proxy" {
  count = var.enable_cognito ? 1 : 0

  name         = "backlog-mcp-proxy-client"
  user_pool_id = aws_cognito_user_pool.mcp_proxy[0].id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  allowed_oauth_flows_user_pool_client = true
  callback_urls                        = var.cognito_callback_urls
  logout_urls                          = var.cognito_logout_urls
  supported_identity_providers         = ["COGNITO"]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_pool_domain" "mcp_proxy" {
  count = var.enable_cognito ? 1 : 0

  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.mcp_proxy[0].id
}
