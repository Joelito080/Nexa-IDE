# Contributing to Nexa IDE

We welcome contributions from the developer community! Follow this guide to report bugs, propose new features, or submit pull requests to Nexa IDE.

---

## 🐛 Bug Reporting

If you encounter an issue, help us resolve it by following these guidelines:
1. **Search Existing Issues**: Check active issues to ensure the bug hasn't already been reported.
2. **Collect Logs**: Navigate to **Settings > About** and click **"Open Logs Folder"**. Locate the log file corresponding to the day of the crash (`nexus-YYYY-MM-DD.log`) and attach the relevant error traces.
3. **Draft a Report**: Create a bug report issue detailing:
   * A clear, concise summary of the issue.
   * Steps to reproduce the bug.
   * Expected vs. actual behavior.
   * Your local configuration (e.g. Windows version, active AI provider, workspace size).

---

## 💡 Feature Requests

We are always looking for ways to improve Nexa IDE! To request a new feature:
1. Open a **Feature Request** issue on GitHub.
2. Describe the feature, why it is valuable to developers, and how it aligns with our roadmap.
3. Provide interface mockups or workflow examples if possible.

---

## 🛠️ Pull Request Guidelines

To ensure code stability and maintain code architecture standards, please follow these steps before submitting a pull request:

### 1. Branch Naming Binds
Name your branches clearly based on the issue type:
* `feature/your-feature-name`
* `bugfix/issue-description`
* `docs/update-documentation`

### 2. TypeScript Typing Verification
We enforce strict TypeScript typings. Always run the compilation check locally to ensure your additions type-check correctly:
```bash
npm run build
```
Any PR containing compile-time errors or missing type declarations will be automatically flagged by CI checks.

### 3. Native Dependencies
If your PR introduces or modifies native C++ dependencies, verify that they compile correctly using the rebuild script:
```bash
npm run rebuild:native
```

### 4. Commits Structure
* Use descriptive, semantic commit messages (e.g. `feat: add telemetry opt-in check`, `fix: handle null path inside log reader`).
* Keep commits focused; avoid large, monolithic PRs containing unrelated features.
