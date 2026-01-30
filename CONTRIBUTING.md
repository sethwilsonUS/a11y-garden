# Contributing to A11y Garden

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/sethwilsonUS/a11y-garden.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Run tests: `npm run test`
6. Push to your fork: `git push origin feature/your-feature-name`
7. Open a Pull Request

## Development Setup

See the [README](README.md) for full setup instructions. For quick local development:

```bash
npm install
npx playwright install chromium
npm run dev:next  # Demo mode - no Convex/Clerk needed
```

## Code Style

- **TypeScript** — All code should be typed. Avoid `any` where possible.
- **ESLint** — Run `npm run lint` before committing.
- **Formatting** — The project uses default ESLint formatting rules.

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add color contrast checker to violations
fix: handle timeout on slow-loading sites
docs: update setup instructions for Windows
refactor: extract grading logic to shared module
```

## Pull Request Guidelines

1. **Keep PRs focused** — One feature or fix per PR
2. **Update tests** — Add tests for new functionality
3. **Update docs** — If your change affects usage, update the README
4. **Describe your changes** — Explain what and why in the PR description

## Testing

```bash
npm run test          # Run tests
npm run test:run      # Run tests once (no watch)
npm run test:coverage # Run with coverage report
```

## Project Structure

Key directories to understand:

- `convex/` — Backend functions and database schema
- `src/app/` — Next.js pages (App Router)
- `src/components/` — Reusable React components
- `src/lib/` — Shared utilities

## Areas for Contribution

Here are some areas where contributions are particularly welcome:

- **Accessibility improvements** — We should practice what we preach!
- **Additional WCAG rules** — Expanding axe-core rule coverage
- **Internationalization** — Adding support for multiple languages
- **Performance** — Faster scans, better caching
- **Documentation** — Tutorials, examples, improved explanations

## Questions?

Feel free to open an issue for discussion before starting work on a large change. This helps ensure your time is well-spent and the change aligns with the project direction.

## Code of Conduct

Be respectful and constructive. We're all here to make the web more accessible.
