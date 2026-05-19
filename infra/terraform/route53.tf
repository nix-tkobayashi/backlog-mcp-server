resource "aws_route53_record" "wildcard" {
  zone_id = var.backlog_zone_id
  name    = "*.backlog.ops.tasdg.info"
  type    = "A"

  alias {
    name                   = aws_lb.mcp.dns_name
    zone_id                = aws_lb.mcp.zone_id
    evaluate_target_health = true
  }
}
