# Workspace Rules

- **Auto Git Commit & Push**: Always automatically commit and push all modified/created files directly to Git (`origin main`) after completing any task, without asking for confirmation each time.
- **Summary**: Always provide a clear, concise summary of the completed work and git push status at the end of every task.

- **Permanent SOP for Code Quality & UI Integrity**:
  1. **Pre & Post Integrity Check**: Always inspect the codebase to prevent UI duplication (e.g. duplicate bulk action toolbars or modals) and state overlapping before and after making changes.
  2. **Comprehensive Scope Verification**: Ensure feature changes (like product selection across search and date filters) seamlessly pass state so all sections function 100% harmoniously.
  3. **Zero Horizontal Overflow & Full Responsiveness**: Ensure containers use responsive Tailwind layout utilities (`flex-wrap`, `max-w-full`, `overflow-x-auto`) to guarantee zero unwanted horizontal page scrollbar across all screen sizes.
  4. **Mandatory Output Format**:
     - Provide a precise, concise summary of modifications along with full file basenames.
     - Provide clean, updated, production-ready code snippets with copyable formatting.

