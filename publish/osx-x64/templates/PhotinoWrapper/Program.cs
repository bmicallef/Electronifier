using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Photino.NET;

namespace PhotinoWrapper;

internal static class Program
{
    private const string AppName = "__APP_NAME__";
    private const string AppDescription = "__APP_DESCRIPTION__";

    public static int Main(string[] args)
    {
        try
        {
            var appRoot = AppContext.BaseDirectory;
            LogSink.Initialize(appRoot);
            LogSink.Append("Photino wrapper booting.");

            var settingsPath = Path.Combine(appRoot, "launch-settings.json");
            var launch = LaunchConfig.Load(settingsPath);
            LogSink.Append($"Loaded launch settings from {settingsPath} (exists={File.Exists(settingsPath)}).");

            using var serverManager = new ServerProcessManager(appRoot, launch, LogSink.Append);
            var backendStarted = serverManager.TryStart(out var backendMessage);

            var entryUrl = serverManager.GetEntryUrl();
            if (string.IsNullOrWhiteSpace(entryUrl))
            {
                LogSink.Append("No entry URL configured; assuming execution script provides its own UI. Not loading Photino host content.");
                if (!backendStarted && !string.IsNullOrWhiteSpace(backendMessage))
                {
                    LogSink.Append($"Backend failed to start: {backendMessage}");
                }

                if (backendStarted)
                {
                    serverManager.WaitForExit();
                }

                return 0;
            }

            var window = BuildWindow(appRoot, launch);
            window.RegisterWebMessageReceivedHandler((sender, message) =>
            {
                var target = sender as PhotinoWindow;
                target?.SendWebMessage($"Received message: {message}");
            });

            LogSink.Append($"Loading entry URL: {entryUrl}");
            window.Load(entryUrl);
            window.WaitForClose();
            return 0;
        }
        catch (Exception ex)
        {
            try { LogSink.Append($"Fatal error: {ex}"); } catch { /* ignored */ }
            return 1;
        }
    }

    private static PhotinoWindow BuildWindow(string appRoot, LaunchConfig launch)
    {
        var window = new PhotinoWindow()
            .SetTitle(AppName)
            .SetUseOsDefaultSize(false);

        var (width, height) = launch.ResolveDimensions();
        window.SetSize(width, height);

        if (launch.Position is LaunchPosition.Centered or LaunchPosition.Unknown)
        {
            window.Center();
        }

        var iconPath = launch.GetIconPath(appRoot);
        if (!string.IsNullOrWhiteSpace(iconPath))
        {
            window.SetIconFile(iconPath);
        }

        return window;
    }

    private static string BuildFallbackHtml(LaunchConfig launch, bool backendStarted, string? backendMessage)
    {
        var sb = new StringBuilder();
        sb.Append("""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <title>
            """);
        sb.Append(AppName);
        sb.Append("""
            </title>
                <style>
                    :root {
                        color-scheme: light dark;
                    }
                    body {
                        margin: 0;
                        font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
                        background: radial-gradient(circle at 30% 20%, #1e1f29, #0c0c12 55%);
                        color: #e8eaf6;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 32px;
                    }
                    .card {
                        max-width: 720px;
                        width: 100%;
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-radius: 16px;
                        padding: 28px;
                        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
                        backdrop-filter: blur(6px);
                    }
                    h1 {
                        margin: 0 0 12px 0;
                        font-size: 28px;
                        letter-spacing: 0.5px;
                    }
                    p {
                        margin: 0 0 10px 0;
                        line-height: 1.6;
                        color: #cfd2e6;
                    }
                    .status {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding: 10px 14px;
                        border-radius: 12px;
                        background: rgba(255, 255, 255, 0.06);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        margin-top: 14px;
                        font-weight: 600;
                    }
                    .status.ok {
                        color: #8ad879;
                    }
                    .status.fail {
                        color: #ffa4b6;
                    }
                    code {
                        background: rgba(255, 255, 255, 0.06);
                        padding: 2px 6px;
                        border-radius: 6px;
                        font-size: 90%;
                        color: #ffde7d;
                    }
                    .muted {
                        color: #9aa0b5;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="card">
        """);

        sb.Append(CultureInfo.InvariantCulture, $"""
                    <h1>{AppName}</h1>
                    <p>{AppDescription}</p>
        """);

        if (!string.IsNullOrWhiteSpace(launch.EntryUrl))
        {
            sb.Append(CultureInfo.InvariantCulture, $"""
                    <p>Attempted to open <code>{launch.EntryUrl}</code> but no backend responded.</p>
            """);
        }
        else
        {
            sb.Append("""
                    <p>No entry URL was configured for this wrapper.</p>
            """);
        }

        var statusClass = backendStarted ? "ok" : "fail";
        var statusText = backendStarted ? "Backend process started" : "Backend failed";
        sb.Append(CultureInfo.InvariantCulture, $"""
                    <div class="status {statusClass}">
                        <span>●</span>
                        <span>{statusText}</span>
                    </div>
        """);

        if (!string.IsNullOrWhiteSpace(backendMessage))
        {
            sb.Append(CultureInfo.InvariantCulture, $"""
                    <p class="muted">{backendMessage}</p>
            """);
        }

        sb.Append("""
                </div>
            </body>
            </html>
        """);

        return sb.ToString();
    }
}

internal static class LogSink
{
    private static readonly List<string> Targets = new();
    private static bool _initialized;

    public static void Initialize(string appRoot)
    {
        if (_initialized)
        {
            return;
        }

        _initialized = true;
        var appName = TryGetAppName(appRoot) ?? "PhotinoWrapper";
        AddTarget(() => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), appName, "backend.log"));
        AddTarget(() => Path.Combine(appRoot, "runtime", "backend.log"));
        AddTarget(() => Path.Combine(Path.GetTempPath(), "photino-wrapper-logs", appName, "backend.log"));
    }

    public static void Append(string text)
    {
        if (!_initialized)
        {
            Initialize(AppContext.BaseDirectory);
        }

        var line = new StringBuilder()
            .Append('[')
            .Append(DateTime.UtcNow.ToString("O"))
            .Append("] ")
            .Append(text ?? string.Empty)
            .AppendLine()
            .ToString();

        foreach (var target in Targets.ToArray())
        {
            try
            {
                var dir = Path.GetDirectoryName(target);
                if (!string.IsNullOrWhiteSpace(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                File.AppendAllText(target, line);
            }
            catch
            {
                // ignore individual target failures
            }
        }
    }

    private static void AddTarget(Func<string> pathFactory)
    {
        try
        {
            var path = pathFactory();
            if (!string.IsNullOrWhiteSpace(path) && !Targets.Contains(path, StringComparer.OrdinalIgnoreCase))
            {
                Targets.Add(path);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static string? TryGetAppName(string appRoot)
    {
        try
        {
            var macApp = new DirectoryInfo(appRoot).Parent?.Parent;
            if (macApp != null && macApp.Extension.Equals(".app", StringComparison.OrdinalIgnoreCase))
            {
                return macApp.Name.Replace(".app", string.Empty, StringComparison.OrdinalIgnoreCase);
            }

            return new DirectoryInfo(appRoot).Parent?.Name;
        }
        catch
        {
            return null;
        }
    }
}

internal sealed class LaunchConfig
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public int? Width { get; set; }
    public int? Height { get; set; }
    public double? WidthPercentage { get; set; }
    public double? HeightPercentage { get; set; }
    public LaunchPosition Position { get; set; } = LaunchPosition.Centered;
    public bool EnableDevTools { get; set; }
    public string? ExecutionScript { get; set; }
    public string? EntryUrl { get; set; }
    public string? Icon { get; set; }

    public static LaunchConfig Load(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                var json = File.ReadAllText(path);
                var parsed = JsonSerializer.Deserialize<LaunchConfig>(json, Options);
                if (parsed is not null)
                {
                    return parsed;
                }
            }
        }
        catch
        {
            // fall back to defaults
        }

        return new LaunchConfig();
    }

    public (int Width, int Height) ResolveDimensions()
    {
        const int defaultWidth = 1020;
        const int defaultHeight = 768;
        var width = Width ?? defaultWidth;
        var height = Height ?? defaultHeight;

        if (WidthPercentage is > 0 and <= 1)
        {
            width = (int)Math.Round(WidthPercentage.Value * defaultWidth);
        }

        if (HeightPercentage is > 0 and <= 1)
        {
            height = (int)Math.Round(HeightPercentage.Value * defaultHeight);
        }

        return (Math.Max(320, width), Math.Max(240, height));
    }

    public string? GetIconPath(string appRoot)
    {
        var iconCandidate = string.IsNullOrWhiteSpace(Icon)
            ? Path.Combine(appRoot, "icons", "appicon.png")
            : Path.IsPathRooted(Icon)
                ? Icon
                : Path.Combine(appRoot, Icon);

        return File.Exists(iconCandidate) ? iconCandidate : null;
    }
}

internal enum LaunchPosition
{
    Unknown,
    Centered,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    Manual
}
