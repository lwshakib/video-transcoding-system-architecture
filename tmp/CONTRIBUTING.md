# Contributing to Video Transcoding System

First off, thank you for considering contributing to this project! It’s people 
like you who make the open-source community such an amazing place to learn, 
inspire, and create.

---

## 🚀 How Can I Contribute?

### 🧩 Improving the Documentation
- Correcting typos or grammar mistakes.
- Clarifying complex sections of the setup guide.
- Adding diagrams or more detailed architecture notes.

### 🧪 Reporting Bugs
- Use the project's Issue Tracker to report bugs.
- Include as much detail as possible, such as logs, screenshots, and steps 
  to reproduce the error.

### 🛠️ Proposing Features
- If you have an idea for a new feature, please open an issue first to 
  discuss it with the maintainers. This ensures the effort aligns with 
  the project's roadmap.

### 💻 Submitting Pull Requests
1. **Fork the repository** to your own GitHub account: `https://github.com/lwshakib/video-transcoding-system-architecture/fork`.
2. **Clone your fork** and create your branch from `main`:
   ```bash
   git clone https://github.com/YOUR_GITHUB_USERNAME/video-transcoding-system-architecture.git
   cd video-transcoding-system-architecture
   git checkout -b your-feature-name
   ```
3. **Setup your environment** (see the local development section).
4. **Commit your changes** with descriptive messages.
5. **Run tests** and linting to ensure quality.
6. **Update documentation** if you are changing any core functionality.
7. **Submit the PR** and wait for feedback!

---

## 🛠️ Local Development Setup

### Monorepo Structure
- `/server`: Node.js/Express API.
- `/web`: Next.js frontend with Tailwind CSS.
- `/transcoding-container`: The worker container for processing videos.

### Running Locally
To get started with local development, ensure you have:
- [Bun](https://bun.sh/) (Primary runtime for the project)
- [Docker](https://www.docker.com/) (For local worker execution)
- [PostgreSQL](https://www.postgresql.org/) (Local or Neon)

1. Clone the repository.
2. Install dependencies in each directory using `bun install`.
3. Follow the [AWS Configuration Guide](./AWS_CONFIGURATION.md) to set up your 
   infrastructure.
4. Start the development servers:
    - **Server**: `cd server && bun run dev`
    - **Web**: `cd web && bun run dev`

---

## 🎨 Coding Standards

### TypeScript
- All new code must be written in TypeScript.
- Avoid using `any`; define interfaces or types for all objects.

### Linting & Formatting
- Follow the project's Prettier and ESLint configurations.
- Ensure all files have a clear header comment (as seen in the current source).

### Commit Messages
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- Example: `feat: add support for HLS subtitles`.

---

## 📢 Community

By contributing, you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

Happy coding! 🚀
