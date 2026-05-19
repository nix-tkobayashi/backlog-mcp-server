data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# --- Task Execution Role (ECS agent: pull image, write logs, read secrets) ---

resource "aws_iam_role" "ecs_task_execution" {
  name               = "backlog-mcp-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_policy" "secrets_read" {
  name = "backlog-mcp-secrets-read"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [for s in aws_secretsmanager_secret.oauth_client_secret : s.arn]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "secrets_read" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.secrets_read.arn
}

# --- Task Role (running container: DynamoDB + KMS when Cognito enabled) ---

resource "aws_iam_role" "ecs_task" {
  name               = "backlog-mcp-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_policy" "cognito_vault" {
  count = var.enable_cognito ? 1 : 0

  name = "backlog-mcp-cognito-vault"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
        ]
        Resource = aws_dynamodb_table.api_keys[0].arn
      },
      {
        Sid    = "KMS"
        Effect = "Allow"
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
        ]
        Resource = aws_kms_key.api_key_encryption[0].arn
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "cognito_vault" {
  count = var.enable_cognito ? 1 : 0

  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.cognito_vault[0].arn
}
