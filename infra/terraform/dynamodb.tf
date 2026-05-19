resource "aws_dynamodb_table" "api_keys" {
  count = var.enable_cognito ? 1 : 0

  name         = "backlog-mcp-api-keys"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "backlogDomain"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "backlogDomain"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}
