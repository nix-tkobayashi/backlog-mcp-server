resource "aws_kms_key" "api_key_encryption" {
  count = var.enable_cognito ? 1 : 0

  description             = "Encrypt Backlog API keys stored in DynamoDB"
  deletion_window_in_days = 14
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RootAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "ECSTaskUse"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ecs_task.arn
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "api_key_encryption" {
  count = var.enable_cognito ? 1 : 0

  name          = "alias/backlog-mcp-api-key"
  target_key_id = aws_kms_key.api_key_encryption[0].key_id
}
