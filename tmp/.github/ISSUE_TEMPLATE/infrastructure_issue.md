---
name: '⚙️ Infrastructure Issue'
about: Report an issue with infra:setup, ECS task registration, or S3/SQS permissions
title: '[INFRA] '
labels: infrastructure
---

**Which process failed?**
- [ ] `bun run infra:setup` (Automated provisioning)
- [ ] `bun run infra:reset` (Cleanup utility)
- [ ] ECR Image Push (`transcoding-container`)
- [ ] ECS Cluster / Task Registration
- [ ] SQS Queue Visibility / Connection
- [ ] S3 Bucket Policy / CORS setup

**Error Message / Terminal Output**
Please paste the full output from your terminal here.

**Your Environment**
- Local OS (Windows/Linux/Mac):
- Bun Version:
- AWS Cli version (if applicable):
- AWS Region:

**Describe the issue**
What happened? (e.g., IAM permission error, ECS task timeout, SQS URL missing).

**Additional Context**
Any custom configurations in your `.env`? (Please redact secrets!)
