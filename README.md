# pi-mmx-quota

MMX Token Plan quota display for [Pi](https://github.com/earendil-works/pi).

Shows MMX quota (daily/weekly percentages, time remaining, usage counts) in the Pi status bar with a configurable settings panel.

## Features

- **Footer status bar**: Shows live quota data
- **Cached fetches**: Shared cache prevents repeated `mmx quota` calls across multiple Pi sessions
- **Configurable display**: Toggle each field individually
- **Settings panel**: `/mmx-quota` command opens a SettingsList UI (like `/settings`)
- **Sub-menu navigation**: General and Video quota settings in separate panels
- **Auto-detection**: Skips Video fields when video is not in your plan

## Display Fields

**Status bar format:** `MMX: D81% | D12m | D∞ | W100% | W14h | V100%`

Prefixes:
- `D` = Daily (interval)
- `W` = Weekly
- `V` = Video (if in plan)

`∞` means unlimited (no hard usage limit).

## Installation

### From GitHub

```bash
pi install git:github.com/animadito/pi-mmx-quota
```

Or pinned to a version:

```bash
pi install git:github.com/animadito/pi-mmx-quota@v0.1.0
```

### Local Install (for development)

```bash
pi install /path/to/pi-mmx-quota
```

## Requirements

- Pi 0.84 or newer
- [mmx-cli](https://www.npmjs.com/package/mmx-cli) installed and authenticated (`mmx auth login`)

## Usage

The extension runs automatically once installed. Run `/mmx-quota` to open the settings panel.

### Settings

Toggle which fields appear in the status bar:

**General menu:**
- Daily %
- Daily time left
- Daily usage (used/total or ∞)
- Weekly %
- Weekly time left
- Weekly usage (used/total or ∞)
- → Video settings (sub-menu)

**Video menu:**
- Video %
- Video time left
- Video usage (used/total or ∞)
- ← Back to general

If video is not in your plan, a warning notice appears at the top of the Video settings panel.

## Update Interval

Quota data refreshes every 5 minutes by default. The shared cache file at `/tmp/pi-mmx-quota-cache.json` has a 1-minute TTL, so multiple Pi sessions share the same fetch.

## Configuration

Settings persist to `~/.pi/mmx-quota-config.json`:

```json
{
  "showDailyPercent": true,
  "showDailyTime": true,
  "showDailyUsage": false,
  "showWeeklyPercent": false,
  "showWeeklyTime": false,
  "showWeeklyUsage": false,
  "showVideoPercent": false,
  "showVideoTime": false,
  "showVideoUsage": false
}
```

## License

MIT
