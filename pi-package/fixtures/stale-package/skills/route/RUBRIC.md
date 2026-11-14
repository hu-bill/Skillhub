# Rubric for judging a candidate tool

Answer every question. "Unknown" is an allowed answer and has to be stated.

1. Does a built-in Pi feature or built-in extension (`builtin:mcp`, `builtin:codemode`, `builtin:tool-search`) already do this? Check the Pi docs first. If one does, stop: the built-in feature is the answer.
2. Who publishes it, and has anyone reviewed it? The Pi maintainers (`earendil-works` / `badlogic`), a known primary vendor, or an unreviewed third party on npm/GitHub.
3. Is it maintained? The date of the last release, open issues, and whether it works with the current Pi version.
4. What does it add to every session? Always-on skill descriptions, active extension tool declarations, system-prompt additions, or `direct` MCP tool schemas (note that Pi MCP defaults to `codemode` exposure rather than `direct`).
5. What can it execute? In-process Pi extensions (full OS permissions), MCP servers, executables, npm install scripts, network access.
6. Does it overlap or conflict with something already installed (for example, an MCP extension that replaces Pi's `builtin:mcp`)?
7. How easy is it to remove? The exact `pi remove`, `pi mcp remove`, or folder-deletion command, and what it leaves behind.

Popularity (stars, download counts) is not a rubric question. Use it only to break a tie.
