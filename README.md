# secure-apikey

A Claude Code mod that lets you store API keys and secrets securely — without ever typing them into the chat transcript.

## What it does

Opens a `/apikey` pane where you can:

- **Type or paste a key value** — shown as `*` characters, never sent to the model
- **Choose the destination** — internal storage only, or write directly to a `.env` file in your project
- **See what's already in the file** — values displayed with the last 4 chars visible (`****abcd`), matching key name highlighted in yellow
- **Confirm the project directory** — shown at the top so you know which `.env` you're editing

## Install

At the prompt of a terminal session:

```
/plugin install secure-apikey --marketplace advhervalforny/claude-secure-apikey
```

From a shell:

```
claude plugin install secure-apikey --marketplace advhervalforny/claude-secure-apikey
```

In the **Claude Code desktop app**: click **+** next to the prompt box → Plugins → Add marketplace with `advhervalforny/claude-secure-apikey` → Add plugin.

## Usage

1. Run `/apikey` to open the pane
2. Select a **destination** — a `.env*` file detected in your project, a custom path, or internal storage only
3. Type the key **Name** (e.g. `OPENAI_API_KEY`)
4. Paste the key **Value** and press **Enter** — the value is masked as `*` on screen
5. The key is written to the chosen file (add or update in place) and saved to internal storage

### File preview

When a file destination is selected, the pane shows its current contents with masked values. If the name you're typing already exists in the file, it's highlighted in yellow with `← already exists`.

## Notes

- Internal storage persists across sessions (`$.store`)
- Masking works for typing character-by-character and for plain pastes (no `*` in the pasted text)
- Deleting characters in the middle of the field may not track correctly — for API keys, pasting the full value at once is recommended
- The value is **never** added to the Claude Code transcript

## License

MIT
