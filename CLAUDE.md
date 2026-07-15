## Autonomous development workflow

For each development task:

1. Update the local default branch from origin.
2. Create a dedicated branch beginning with `agent/`.
3. Inspect the existing architecture and tests before editing.
4. Implement the complete task, including tests and documentation.
5. Run all relevant tests, linting, type checks, and builds.
6. Review the complete diff for regressions, unnecessary changes, and generated files.
7. Fix all issues found during self-review.
8. Commit logically grouped changes.
9. Push the feature branch to origin.
10. Create or update a pull request with:
   - purpose and design rationale;
   - files and components changed;
   - tests and validation performed;
   - known limitations;
   - screenshots for GUI changes.

Continue fixing the branch until all available checks pass.

Do not merge pull requests.
Do not push directly to main or master.
Do not force-push.
Do not alter Git remotes.
The human maintainer performs the final review and merge.
