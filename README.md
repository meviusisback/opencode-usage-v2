# opencode-usage

A [Hermes Agent](https://github.com/NousResearch/hermes-agent) desktop plugin that shows your AI provider's usage in the status bar.

**Session-aware** — only shows the provider matching your current session's model. Switch sessions, and the chip adapts.

![status bar](https://img.shields.io/badge/status-bar-22c55e) ![Hermes](https://img.shields.io/badge/Hermes-Desktop-7c3aed)

## Supported Providers

| Provider | Windows | Status |
|----------|---------|--------|
| OpenCode Go | 5h · Weekly · Monthly | ✅ Working |
| OpenCode Zen | 5h · Weekly · Monthly | 🔜 Ready to enable |
| GitHub Copilot | Primary · Secondary | 🔜 Placeholder |

## Install

```bash
# Clone into Hermes plugins directory
git clone https://github.com/meviusisback/opencode-usage.git ~/.hermes/plugins/opencode-usage
```

Then in Hermes Desktop:
1. **⌘K** → search "Plugins"
2. Enable **opencode-usage** under **Agent plugins**
3. Enable **opencode-usage** under **Desktop plugins**
4. **⌘K** → "Reload desktop plugins"

## Configure

Add your API key to `~/.hermes/.env`:

```bash
OPENCODE_GO_API_KEY=your-key-here
```

The key is read automatically by the Python backend.

## Adding a Provider

Edit `providers.py`:

```python
{
    "id": "my-provider",
    "name": "My Provider",
    "key_env": "MY_PROVIDER_API_KEY",
    "endpoint": "https://api.example.com/usage",
    "enabled": True,
    "headers": {"Accept": "application/json"},
    "windows": [
        {"id": "daily", "label": "D"},
        {"id": "monthly", "label": "M"},
    ],
    "parse": _parse_opencode,  # or write a custom parser
}
```

Then add `MY_PROVIDER_API_KEY=...` to your `.env` and reload plugins.

## Architecture

```
opencode-usage/
├── plugin.yaml              # Plugin manifest
├── providers.py             # Provider registry (edit this to add providers)
├── dashboard/
│   └── plugin_api.py        # Python backend (reads .env, proxies API calls)
└── desktop/
    └── plugin.js            # Desktop UI (status bar chip)
```

- **Python backend** runs in the gateway process, reads API keys from `.env`, and proxies usage calls
- **Desktop frontend** watches `host.state.model` to detect the active provider, then fetches and renders its usage
- **Provider registry** is the single file to edit when adding new providers

## Security

- API keys are cached after first read; `.env` is not re-parsed on every request
- Error messages are sanitized — never leak headers, keys, or stack traces
- Response is schema-validated; only known fields are forwarded
- Explicit SSL context with certificate verification
- Response body is size-limited (4KB) to prevent OOM

## License

MIT
