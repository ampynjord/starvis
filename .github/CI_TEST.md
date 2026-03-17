# CI/CD Pipeline Test

This file was created to trigger and validate the full CI/CD pipeline.

## Jobs tested

- 🔍 **Lint & Type-check** — Biome linting + TypeScript type-check on API and Extractor
- 🧪 **Tests** — Unit tests, integration tests, and E2E tests (with MySQL & Redis services)
- 🐳 **Build** — Docker image build for API and IHM

> The **Deploy** job is not triggered on pull requests — it only runs on pushes to `main`.
