resource "aws_secretsmanager_secret" "oauth_client_secret" {
  for_each = var.sites

  name                    = "backlog-mcp-server/${each.key}/oauth-client-secret"
  description             = "Backlog OAuth Client Secret for site: ${each.key}"
  recovery_window_in_days = 7
}
