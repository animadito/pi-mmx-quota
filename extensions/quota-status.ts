import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";

interface QuotaResponse {
  model_remains: Array<{
    model_name: string;
    start_time: number;
    end_time: number;
    remains_time: number;
    current_interval_total_count: number;
    current_interval_usage_count: number;
    current_interval_status: number;
    current_interval_remaining_percent: number;
    current_weekly_total_count: number;
    current_weekly_usage_count: number;
    weekly_start_time: number;
    weekly_end_time: number;
    weekly_remains_time: number;
    current_weekly_status: number;
    current_weekly_remaining_percent: number;
  }>;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

interface CachedQuota {
  general: ModelQuota | null;
  video: ModelQuota | null;
  timestamp: number;
}

interface ModelQuota {
  available: boolean;
  remainsTime: number;
  intervalPercent: number;
  intervalUsage: number;
  intervalTotal: number;
  intervalStatus: number;
  weeklyTime: number;
  weeklyPercent: number;
  weeklyUsage: number;
  weeklyTotal: number;
  weeklyStatus: number;
}

interface Config {
  showDailyPercent: boolean;
  showDailyTime: boolean;
  showDailyUsage: boolean;
  showWeeklyPercent: boolean;
  showWeeklyTime: boolean;
  showWeeklyUsage: boolean;
  showVideoPercent: boolean;
  showVideoTime: boolean;
  showVideoUsage: boolean;
}

const CACHE_FILE = join(require("node:os").tmpdir(), "pi-mmx-quota-cache.json");
const CACHE_TTL = 60 * 1000;
const CONFIG_FILE = join(require("node:os").homedir(), ".pi", "mmx-quota-config.json");

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getConfig(): Config {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {
    // Ignore
  }
  return {
    showDailyPercent: true,
    showDailyTime: true,
    showDailyUsage: false,
    showWeeklyPercent: false,
    showWeeklyTime: false,
    showWeeklyUsage: false,
    showVideoPercent: false,
    showVideoTime: false,
    showVideoUsage: false,
  };
}

function setConfig(config: Config) {
  try {
    mkdirSync(join(require("node:os").homedir(), ".pi"), { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config), "utf-8");
  } catch {
    // Ignore
  }
}

function getCachedQuota(): CachedQuota | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const data = readFileSync(CACHE_FILE, "utf-8");
    const cached: CachedQuota = JSON.parse(data);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached;
    }
  } catch {
    // Ignore
  }
  return null;
}

function setCachedQuota(quota: CachedQuota) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(quota), "utf-8");
  } catch {
    // Ignore write errors
  }
}

function parseModel(model: QuotaResponse["model_remains"][0]): ModelQuota {
  // A model is "not in plan" if:
  // - Both interval and weekly status indicate inactive (status 3 = inactive/unlimited)
  // - AND both usage counts are 0 (no tracking)
  // - AND it's not the general model (which has unlimited weekly)
  const noTracking =
    model.current_interval_usage_count === 0 &&
    model.current_weekly_usage_count === 0 &&
    model.current_interval_total_count === 0 &&
    model.current_weekly_total_count === 0;
  const inactive = model.current_interval_status === 3 && model.current_weekly_status === 3;
  const available = !(inactive && noTracking && model.model_name !== "general");

  return {
    available,
    remainsTime: model.remains_time,
    intervalPercent: model.current_interval_remaining_percent,
    intervalUsage: model.current_interval_usage_count,
    intervalTotal: model.current_interval_total_count,
    intervalStatus: model.current_interval_status,
    weeklyTime: model.weekly_remains_time,
    weeklyPercent: model.current_weekly_remaining_percent,
    weeklyUsage: model.current_weekly_usage_count,
    weeklyTotal: model.current_weekly_total_count,
    weeklyStatus: model.current_weekly_status,
  };
}

async function fetchQuota(): Promise<CachedQuota | null> {
  const cached = getCachedQuota();
  if (cached) return cached;

  try {
    const { execSync } = await import("node:child_process");
    const output = execSync("mmx quota show --output json --non-interactive", {
      encoding: "utf-8",
      timeout: 10000,
    });
    const data: QuotaResponse = JSON.parse(output);

    const general = data.model_remains.find((m) => m.model_name === "general");
    const video = data.model_remains.find((m) => m.model_name === "video");

    const quota: CachedQuota = {
      general: general ? parseModel(general) : null,
      video: video ? parseModel(video) : null,
      timestamp: Date.now(),
    };
    setCachedQuota(quota);
    return quota;
  } catch {
    // Ignore errors
  }
  return null;
}

function buildGeneralItems(config: Config): SettingItem[] {
  return [
    {
      id: "showDailyPercent",
      label: "Q (quota percent)",
      currentValue: config.showDailyPercent ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "showDailyTime",
      label: "R: (reset time)",
      currentValue: config.showDailyTime ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "showDailyUsage",
      label: "R: (reset usage)",
      currentValue: config.showDailyUsage ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "showWeeklyPercent",
      label: "Weekly %",
      currentValue: config.showWeeklyPercent ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "showWeeklyTime",
      label: "Weekly time left",
      currentValue: config.showWeeklyTime ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "showWeeklyUsage",
      label: "Weekly usage (used/total)",
      currentValue: config.showWeeklyUsage ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "__nav_video__",
      label: "Video settings",
      currentValue: "→",
      values: ["→"],
    },
  ];
}

function buildVideoItems(config: Config): SettingItem[] {
  return [
    {
      id: "showVideoPercent",
      label: "Video %",
      currentValue: config.showVideoPercent ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "showVideoTime",
      label: "Video time left",
      currentValue: config.showVideoTime ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "showVideoUsage",
      label: "Video usage (used/total)",
      currentValue: config.showVideoUsage ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "__nav_general__",
      label: "Back to general",
      currentValue: "←",
      values: ["←"],
    },
  ];
}

export default function (pi: ExtensionAPI) {
  const STATUS_KEY = "mmx-quota";
  let interval: ReturnType<typeof setInterval> | null = null;
  let ctx: ExtensionContext | null = null;

  async function updateStatus() {
    if (!ctx) return;

    const quota = await fetchQuota();
    const config = getConfig();
    const theme = ctx.ui.theme;

    if (!quota) {
      ctx.ui.setStatus(STATUS_KEY, theme.fg("dim", "MMX: unavailable"));
      return;
    }

    const parts: string[] = [];

    // General quota fields
    if (quota.general) {
      if (config.showDailyPercent) parts.push(`Q ${quota.general.intervalPercent}%`);
      if (config.showDailyTime) parts.push(`R: ${formatDuration(quota.general.remainsTime)}`);
      if (config.showDailyUsage) {
        if (quota.general.intervalTotal > 0) {
          parts.push(`R: ${quota.general.intervalUsage}/${quota.general.intervalTotal}`);
        } else {
          parts.push(`R: ∞`);
        }
      }
      if (config.showWeeklyPercent) parts.push(`W${quota.general.weeklyPercent}%`);
      if (config.showWeeklyTime) parts.push(`W${formatDuration(quota.general.weeklyTime)}`);
      if (config.showWeeklyUsage) {
        if (quota.general.weeklyTotal > 0) {
          parts.push(`W${quota.general.weeklyUsage}/${quota.general.weeklyTotal}`);
        } else {
          parts.push(`W∞`);
        }
      }
    }

    // Video fields (only if available in plan)
    if (quota.video && quota.video.available) {
      if (config.showVideoPercent) parts.push(`V${quota.video.intervalPercent}%`);
      if (config.showVideoTime) parts.push(`V${formatDuration(quota.video.remainsTime)}`);
      if (config.showVideoUsage) {
        if (quota.video.intervalTotal > 0) {
          parts.push(`V${quota.video.intervalUsage}/${quota.video.intervalTotal}`);
        } else {
          parts.push(`V∞`);
        }
      }
    }

    const statusText = parts.length > 0 ? `MMX: ${parts.join(" | ")}` : "MMX: hidden";
    ctx.ui.setStatus(STATUS_KEY, theme.fg("dim", statusText));
  }

  // Helper to show settings panel for a specific mode
  async function showSettingsPanel(
    extensionCtx: ExtensionContext,
    mode: "general" | "video",
  ): Promise<void> {
    let shouldNavigateTo: "general" | "video" | null = null;

    const config = getConfig();
    const items = mode === "general" ? buildGeneralItems(config) : buildVideoItems(config);
    const title = mode === "general" ? "MMX Quota Settings (General)" : "MMX Quota Settings (Video)";

    // Check video availability for the notice
    const quota = await fetchQuota();
    const videoNotInPlan = mode === "video" && quota && (!quota.video || !quota.video.available);

    await extensionCtx.ui.custom<void>(
      (tui, theme, _kb, done) => {
        const settingsList = new SettingsList(
          items,
          Math.min(items.length + 2, 12),
          getSettingsListTheme(),
          async (id, newValue) => {
            if (id === "__nav_video__") {
              shouldNavigateTo = "video";
              done(undefined);
              return;
            }
            if (id === "__nav_general__") {
              shouldNavigateTo = "general";
              done(undefined);
              return;
            }
            // Regular toggle
            const newConfig = getConfig();
            (newConfig as any)[id] = newValue === "on";
            setConfig(newConfig);
            await updateStatus();
            extensionCtx.ui.notify(`${id} = ${newValue}`, "info");
          },
          () => {
            done(undefined);
          },
          { enableSearch: true },
        );

        const container = new Container();
        const headerLines: string[] = [theme.fg("accent", theme.bold(title)), ""];
        if (videoNotInPlan) {
          headerLines.push(theme.fg("warning", "⚠ Video is not in your plan"));
          headerLines.push(theme.fg("dim", "  Fields below won't show until video is enabled"));
          headerLines.push("");
        }
        container.addChild(
          new (class {
            render(_width: number) {
              return headerLines;
            }
            invalidate() {}
          })(),
        );
        container.addChild(settingsList);

        return {
          render(width: number) {
            return container.render(width);
          },
          invalidate() {
            container.invalidate();
          },
          handleInput(data: string) {
            settingsList.handleInput?.(data);
            tui.requestRender();
          },
        };
      },
      {
        overlay: true,
        overlayOptions: {
          anchor: "bottom-center",
          width: "100%",
          maxHeight: 15,
          margin: { bottom: 2 },
        },
        onHandle: (handle) => {
          handle.focus();
        },
      },
    );

    // Navigate if requested
    if (shouldNavigateTo) {
      await showSettingsPanel(extensionCtx, shouldNavigateTo);
    }
  }

  // Register command to force refresh quota
  pi.registerCommand("mmx-quota-refresh", {
    description: "Force refresh MMX quota",
    handler: async (_args, extensionCtx) => {
      ctx = extensionCtx;
      await updateStatus();
    },
  });

  // Register command to open settings TUI
  pi.registerCommand("mmx-quota", {
    description: "Open MMX quota settings",
    handler: async (_args, extensionCtx) => {
      await showSettingsPanel(extensionCtx, "general");
      await updateStatus();
    },
  });

  // Update on session start
  pi.on("session_start", async (_event, extensionCtx) => {
    ctx = extensionCtx;
    await updateStatus();

    if (interval) clearInterval(interval);
    interval = setInterval(updateStatus, 5 * 60 * 1000);
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async (_event, extensionCtx) => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    // Note: Don't call setStatus with null - pi's sanitizeStatusText crashes on null
    // Session is ending anyway, status will be cleared
    ctx = null;
  });
}
