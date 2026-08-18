# OpenCode Usage Plugin

A Hermes Agent plugin that tracks OpenCode Go API usage across multiple time windows.

## Features

- **Status Bar Chip**: Shows usage as a compact chip in the status bar
- **Three Usage Windows**:
  - Rolling (5h): Last 5 hours usage
  - Weekly (W): Current week usage
  - Monthly (M): Current month usage
- **Color-coded Status**: Green (< 70%), Yellow (70-89%), Red (≥ 90%)

## Installation

### As a Dashboard Plugin

1. Copy the `dashboard/` folder to `~/.hermes/plugins/opencode-usage/dashboard/`
2. Copy `plugin.yaml` to `~/.hermes/plugins/opencode-usage/`
3. Restart the Hermes dashboard

### As a Desktop Plugin

1. Copy the `desktop-plugins/opencode-usage/` folder to `~/.hermes/desktop-plugins/opencode-usage/`
2. Restart the Hermes desktop app

## Configuration

Set your OpenCode Go API key in `~/.hermes/.env`:

```
OPENCODE_GO_API_KEY=your-api-key-here
```

Or export it as an environment variable:

```bash
export OPENCODE_GO_API_KEY=your-api-key-here
```

## API Endpoints

- `GET /api/plugins/opencode-usage/usage` - Get current usage data
- `GET /api/plugins/opencode-usage/health` - Health check

## License

MIT
