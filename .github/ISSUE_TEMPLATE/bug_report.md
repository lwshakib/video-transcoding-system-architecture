---
name: '🐛 Bug Report'
about: Report a technical issue with the video transcoding pipeline or dashboard
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear description of the issue (e.g., "Transcoding fails for .mov files", "HLS player not loading").

**Video S3 Key / Original filename (if applicable)**
Copy the S3 key or filename of the video that is failing to transcode.

**To Reproduce**
Steps to reproduce the behavior:
1. Upload a video file named '...'
2. Wait for status to change to 'PROCESSING'
3. See error '...' in the dashboard or terminal.

**Infrastructure Context**
- Are you using the **Automated Setup** (`infra:setup`) or Manual Provisioning?
- AWS Region:
- ECS Task Status (if known):

**Expected behavior**
What you expected to happen (e.g., "Video should be transcoded to HLS with multiple bitrates").

**Screenshots/Logs**
- Dashboard screenshots showing the error state.
- (Recommended) CloudWatch Logs from the ECS `transcoding-container` task.

**Environment (please complete):**
- OS: [e.g. Windows, MacOS]
- Browser (for HLS player issues): [e.g. Chrome, Safari]
- Bun/Node Version:
- FFmpeg Version (if running locally):

**Additional context**
Add any other context about the problem here (e.g., specific video codec or resolution).
