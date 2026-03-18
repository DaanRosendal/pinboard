# Incident Response

## Severity levels

| Level | Definition | Response time |
|-------|-----------|---------------|
| P0    | Full outage | 15 min |
| P1    | Major feature down | 1 hour |
| P2    | Degraded service | 4 hours |

## Steps

1. Acknowledge the alert in PagerDuty
2. Join the incident Slack channel `#incidents`
3. Assess impact and declare severity
4. Roll back if a recent deploy is the root cause: `./tools/scripts/release.sh production --rollback`
