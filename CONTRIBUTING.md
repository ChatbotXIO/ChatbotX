# Contributing to ChatbotX

Thank you for your interest in contributing to ChatbotX! This document provides guidelines and instructions for contributing to the project.

## Read the developers guide

The main documentation site has a [developer guide](https://chatbotx.io/docs/howitworks). That guide provides you a good understanding of the project structure, and how to setup your development environment. Read this document after you have read that guide. This document is intended to provide you a good understanding of how to submit your first contribution.


## Write code with others

This is an open source project, with an open and welcoming community that is always keen to welcome new contributors. We recommend the two best ways to interact with the community are:

- **GitHub issues**: To discuss more slowly, or longer-written messages.
- **[Discord chat](https://discord.chatbotx.io)**: To chat with people and get quicker feedback.

As a general rule;

- **If a change is less than 3 lines**: You're probably safe just to submit the change without a discussion. This includes typos, dependency changes, and quick fixes, etc.
- **If a change is more than 3 lines**: It's probably best to discuss the change in an issue or on discord first. This is simply because you might not be aware of the roadmap for the project, or understand the impact this change might have. We're just trying to save you time here, and importantly, avoid you being disappointed if your change isn't accepted.

## Types of Contributions

Contributions can include:

- **Code improvements:** Fixing bugs or adding new features.
- **Documentation updates:** Enhancing clarity or adding missing information.
- **Feature requests:** Suggesting new capabilities or integrations.
- **Bug reports:** Identifying and reporting issues.

## AI

AI-assisted development is welcome — this repository ships first-class tooling for it (see `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`). What we **do not** accept are Pull Requests where AI output has been submitted without human review or understanding.

You are responsible for every line you submit. Make sure you understand your changes, that they follow the guidelines below, and that they have been tested. We reserve the right to close any PR that appears to be unreviewed AI output.

## How to contribute

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/chatbotx.git`
3. Create a new branch: `git checkout -b feat/your-feature-name`
4. Install dependencies: `pnpm install`
5. Copy `.env.example` to `.env` and configure your environment variables
6. Make your changes
7. Commit your changes: `git commit -m "feat: description of changes"`
8. Push to your fork: `git push origin feat/your-feature-name`
9. Open a Pull Request

## Development Guidelines

### Code Style

- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and concise

### Commits

- Use clear and descriptive commit messages
- Reference issue numbers when applicable
- Keep commits focused on single changes

### Pull Requests

- Provide a clear description of the changes
- Include screenshots for UI changes
- Keep PRs focused on a single feature/fix

## Need Help?

- Join our [Discord chat](https://discord.chatbotx.io) for questions
- Check existing issues and pull requests
- Email [security@chatbotx.io](mailto:security@chatbotx.io) for major concerns

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

We aim to foster an inclusive and welcoming community. Harassment and abusive behavior will not be tolerated.

## License

By contributing to ChatbotX, you agree that your contributions will be licensed under the AGPLv3 License.
