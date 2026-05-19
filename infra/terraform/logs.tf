resource "aws_cloudwatch_log_group" "mcp" {
  name              = "/ecs/backlog-mcp-server"
  retention_in_days = var.log_retention_days
}
