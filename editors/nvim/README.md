# Plow for Neovim

Neovim configuration for [`plow-lsp`](https://github.com/fglogan/genesis-plow), the language server behind Plow's editor diagnostics.

## What works

- diagnostics for unused files, exports, types, dependencies, enum/class members, unresolved imports, unlisted deps, duplicate exports, circular dependencies, and duplication
- hover information
- quick-fix code actions
- code lens where Neovim surfaces them

This setup is intentionally thin. It launches the existing `plow-lsp` binary instead of re-implementing analysis logic inside the editor.

## Installation

Install Plow globally so `plow-lsp` is available on your `PATH`:

```sh
npm install -g plow
```

Confirm Neovim can see the language server binary:

```sh
plow-lsp --version
```

## Configuration

Add the language server to your Neovim config:

```lua
vim.lsp.config("plow", {
	cmd = { "plow-lsp" },
	filetypes = { "javascript", "typescript", "javascriptreact", "typescriptreact" },
	root_markers = { ".plowrc.json", "package.json", ".git" },
	init_options = {
		-- Every issue type is enabled by default. List only the ones you
		-- want to turn off; any key you omit stays enabled.
		issueTypes = {
			["circular-dependencies"] = false,
		},
	},
})

vim.lsp.enable("plow")
```

`init_options` is optional; `cmd`, `filetypes`, and `root_markers` alone are enough to attach. Plow reads issue toggles from LSP initialization options: set an issue type to `false` to disable it in editor diagnostics without changing your project config. The full list of keys matches Plow's issue types (kebab-case); a client can fetch the live catalog via the custom `plow/issueTypes` request.

Diagnostics are delivered through the LSP 3.17 pull model and refreshed on save. The first analysis runs when the server attaches, so a freshly opened buffer shows findings once the initial pass completes (or after the next save), not necessarily the instant the file opens.

## Binary resolution

Neovim runs the `cmd` exactly as configured. If `plow-lsp` is not on Neovim's `PATH`, point `cmd` at the absolute binary path:

```lua
vim.lsp.config("plow", {
	cmd = { "/absolute/path/to/plow-lsp" },
	filetypes = { "javascript", "typescript", "javascriptreact", "typescriptreact" },
	root_markers = { ".plowrc.json", "package.json", ".git" },
})
```

## Development

1. Install Plow globally with `npm install -g plow`.
2. Add the config above to your Neovim setup.
3. Open a TypeScript or JavaScript project and run `:checkhealth vim.lsp`.
4. Confirm `plow` is attached with `:lua vim.print(vim.lsp.get_clients({ name = "plow" }))`.
