# Repository Guidelines

## Project Structure & Module Organization
Keep runtime modules in `src/` and organize domain-specific code under `src/henkan/` (create the package when you add the first module). Shared utilities live in `src/henkan/utils/`, while scripts that glue components together belong in `scripts/`. Commit sample data or fixtures to `tests/fixtures/`; avoid checking in large assets—store those in an external bucket and document the location in `docs/`.

## Build, Test, and Development Commands
Create a virtual environment before installing dependencies:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
Run formatters and static analysis with `make lint` (or `ruff check . && black .` if `make` is unavailable). Execute unit and integration suites with `pytest` from the repo root. When publishing a distributable artifact, call `python -m build` to generate wheels and source archives under `dist/`.

## Coding Style & Naming Conventions
Follow PEP 8 with 4-space indentation and limit lines to 100 characters. Use `snake_case` for functions and modules, `PascalCase` for classes, and reserve `SCREAMING_SNAKE_CASE` for constants in `config.py`. Run `black` and `ruff` locally before pushing to keep formatting consistent. Document exported functions with concise docstrings that describe inputs, outputs, and side effects.

## Testing Guidelines
Write `pytest` tests under `tests/` mirroring the `src/` tree (e.g., `src/henkan/parser.py` → `tests/henkan/test_parser.py`). Prefix async-focused tests with `test_async_` for quick filtering. Target ≥90% coverage on new modules using `pytest --cov=henkan --cov-report=term-missing`. Include property-based tests via `hypothesis` when validating converters, and provide fixtures for any external API calls.

## Commit & Pull Request Guidelines
Adopt Conventional Commits (`feat:`, `fix:`, `docs:`) so changelogs stay machine-readable. Each commit should be scoped and lint-clean. Pull requests need a succinct summary, linked issue or task reference, and verification notes (tests run, data validated). Include screenshots or CLI transcripts when the change affects user-facing behavior. Request review from at least one maintainer before merging.

## Security & Configuration Tips
Store secrets in `.env.local` and load them with `python-dotenv`; never commit actual credentials. Validate inbound data at module boundaries and prefer parameterized queries for database work. Keep dependencies up to date with `pip-review --auto` and flag high-risk CVEs before release.
