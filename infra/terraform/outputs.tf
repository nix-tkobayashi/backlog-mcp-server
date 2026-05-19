output "ecr_repository_url" {
  value = aws_ecr_repository.backlog_mcp.repository_url
}

output "alb_dns_name" {
  value = aws_lb.mcp.dns_name
}

output "site_urls" {
  value = { for name, _ in var.sites : name => "https://${name}.backlog.ops.tasdg.info/mcp" }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.mcp.name
}

output "secrets_to_populate" {
  value       = { for name, s in aws_secretsmanager_secret.oauth_client_secret : name => s.name }
  description = "Run: aws secretsmanager put-secret-value --secret-id <name> --secret-string '<SECRET>'"
}

output "cognito_user_pool_id" {
  value = var.enable_cognito ? aws_cognito_user_pool.mcp_proxy[0].id : null
}

output "cognito_client_id" {
  value = var.enable_cognito ? aws_cognito_user_pool_client.mcp_proxy[0].id : null
}

output "cognito_domain" {
  value = var.enable_cognito ? "https://${var.cognito_domain_prefix}.auth.${var.aws_region}.amazoncognito.com" : null
}

output "dynamodb_table_name" {
  value = var.enable_cognito ? aws_dynamodb_table.api_keys[0].name : null
}

output "kms_key_id" {
  value = var.enable_cognito ? aws_kms_key.api_key_encryption[0].key_id : null
}
