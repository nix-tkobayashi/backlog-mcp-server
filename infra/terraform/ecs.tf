locals {
  site_env_vars = flatten([
    for name, site in var.sites : [
      {
        name  = "BACKLOG_OAUTH_SITE_${upper(name)}_BASE_URL"
        value = "https://${name}.backlog.ops.tasdg.info"
      },
      {
        name  = "BACKLOG_OAUTH_SITE_${upper(name)}_DOMAIN"
        value = site.backlog_domain
      },
      {
        name  = "BACKLOG_OAUTH_SITE_${upper(name)}_CLIENT_ID"
        value = site.oauth_client_id
      },
    ]
  ])

  site_secrets = [
    for name, site in var.sites : {
      name      = "BACKLOG_OAUTH_SITE_${upper(name)}_CLIENT_SECRET"
      valueFrom = aws_secretsmanager_secret.oauth_client_secret[name].arn
    }
  ]

  cognito_env_vars = var.enable_cognito ? [
    { name = "COGNITO_USER_POOL_ID", value = aws_cognito_user_pool.mcp_proxy[0].id },
    { name = "COGNITO_REGION", value = var.aws_region },
    { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.mcp_proxy[0].id },
    { name = "DYNAMODB_API_KEY_TABLE", value = aws_dynamodb_table.api_keys[0].name },
    { name = "KMS_KEY_ID", value = aws_kms_key.api_key_encryption[0].key_id },
  ] : []
}

resource "aws_ecs_cluster" "main" {
  name = "backlog-mcp"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "mcp" {
  family                   = "backlog-mcp-server"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "backlog-mcp-server"
    image     = "${aws_ecr_repository.backlog_mcp.repository_url}:${var.container_image_tag}"
    essential = true

    command = [
      "node", "build/index.js",
      "--transport", "http",
      "--http-host", "0.0.0.0"
    ]

    portMappings = [{
      containerPort = 3333
      protocol      = "tcp"
    }]

    environment = concat(
      [
        { name = "MCP_HTTP_HOST", value = "0.0.0.0" },
        { name = "MCP_HTTP_PORT", value = "3333" },
        { name = "LOG_LEVEL", value = "info" },
      ],
      local.site_env_vars,
      local.cognito_env_vars,
    )

    secrets = local.site_secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.mcp.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

resource "aws_ecs_service" "mcp" {
  name            = "backlog-mcp-server"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.mcp.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  health_check_grace_period_seconds  = 30

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mcp.arn
    container_name   = "backlog-mcp-server"
    container_port   = 3333
  }

  depends_on = [aws_lb_listener.https]
}
