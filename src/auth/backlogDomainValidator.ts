const BACKLOG_DOMAIN_PATTERN =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.(backlog\.jp|backlog\.com|backlogtool\.com)$/;

export function isValidBacklogDomain(domain: string): boolean {
  return BACKLOG_DOMAIN_PATTERN.test(domain);
}
