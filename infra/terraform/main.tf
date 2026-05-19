terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket  = "backlog-mcp-tfstate-286979397958"
    key     = "backlog-mcp-server/terraform.tfstate"
    region  = "ap-northeast-1"
    encrypt = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "backlog-mcp-server"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
