resource "aws_security_group" "alb" {
  name_prefix = "backlog-mcp-alb-"
  description = "ALB for Backlog MCP Server"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "backlog-mcp-alb-sg" }

  lifecycle { create_before_destroy = true }
}

resource "aws_security_group" "ecs" {
  name_prefix = "backlog-mcp-ecs-"
  description = "ECS tasks for Backlog MCP Server"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "backlog-mcp-ecs-sg" }

  lifecycle { create_before_destroy = true }
}

locals {
  allowed_cidrs = [
    "159.28.65.139/32",
    "116.199.177.45/32",
    "52.198.164.38/32",
    "116.58.182.49/32",
    "180.4.153.149/32",
  ]
}

# --- ALB SG rules ---

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from anywhere (OAuth-protected)"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  for_each = toset(local.allowed_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "HTTP redirect from ${each.value}"
  cidr_ipv4         = each.value
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id            = aws_security_group.alb.id
  description                  = "To ECS tasks"
  referenced_security_group_id = aws_security_group.ecs.id
  from_port                    = 3333
  to_port                      = 3333
  ip_protocol                  = "tcp"
}

# --- ECS SG rules ---

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "From ALB"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3333
  to_port                      = 3333
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "ecs_https_out" {
  security_group_id = aws_security_group.ecs.id
  description       = "HTTPS outbound (Backlog API, ECR)"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "ecs_dns_tcp" {
  security_group_id = aws_security_group.ecs.id
  description       = "DNS TCP"
  cidr_ipv4         = var.vpc_cidr
  from_port         = 53
  to_port           = 53
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "ecs_dns_udp" {
  security_group_id = aws_security_group.ecs.id
  description       = "DNS UDP"
  cidr_ipv4         = var.vpc_cidr
  from_port         = 53
  to_port           = 53
  ip_protocol       = "udp"
}
