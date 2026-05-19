variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "backlog_zone_id" {
  type        = string
  description = "Route53 hosted zone ID for backlog.ops.tasdg.info"
}

variable "backlog_acm_arn" {
  type        = string
  description = "ACM certificate ARN for *.backlog.ops.tasdg.info"
}

variable "sites" {
  type = map(object({
    backlog_domain  = string
    oauth_client_id = string
  }))
  description = "Map of site name → Backlog OAuth config. Key becomes the subdomain: <key>.backlog.ops.tasdg.info"

  validation {
    condition     = alltrue([for k, _ in var.sites : can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", k))])
    error_message = "Site keys must be valid DNS labels: lowercase letters, digits, and hyphens (no leading/trailing hyphen)."
  }
}

variable "container_image_tag" {
  type    = string
  default = "latest"
}

variable "ecs_cpu" {
  type    = number
  default = 256
}

variable "ecs_memory" {
  type    = number
  default = 512
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "vpc_cidr" {
  type    = string
  default = "10.100.0.0/16"
}

variable "enable_cognito" {
  type        = bool
  default     = false
  description = "Enable Cognito JWT authentication + API key vault for proxy users"
}

variable "cognito_domain_prefix" {
  type        = string
  default     = "backlog-mcp"
  description = "Cognito hosted UI domain prefix (<prefix>.auth.<region>.amazoncognito.com)"
}

variable "cognito_callback_urls" {
  type        = list(string)
  default     = ["http://localhost:18923/callback"]
  description = "OAuth callback URLs for Cognito app client"
}

variable "cognito_logout_urls" {
  type        = list(string)
  default     = ["http://localhost:18923"]
  description = "Logout URLs for Cognito app client"
}
