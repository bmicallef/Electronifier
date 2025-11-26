using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;

namespace PhotinoWrapper;

internal sealed class ServerProcessManager : IDisposable
{
    private readonly string _appRoot;
    private readonly LaunchConfig _launchConfig;
    private readonly string _runtimeRoot;
    private readonly Action<string> _logger;
    private Process? _process;

    public ServerProcessManager(string appRoot, LaunchConfig launchConfig, Action<string> logger)
    {
        _appRoot = appRoot;
        _launchConfig = launchConfig;
        _runtimeRoot = Path.Combine(appRoot, "runtime");
        _logger = logger ?? (_ => { });
    }

    public string? GetEntryUrl()
    {
        var configured = _launchConfig.EntryUrl?.Trim();
        return string.IsNullOrWhiteSpace(configured) ? null : configured;
    }

    public void WaitForExit()
    {
        try
        {
            _process?.WaitForExit();
        }
        catch
        {
            // ignored
        }
    }

    public bool TryStart(out string message)
    {
        if (!Directory.Exists(_runtimeRoot))
        {
            message = $"Managed runtime not found at {_runtimeRoot}.";
            AppendLog(message);
            return false;
        }

        var (fileName, arguments) = ResolveCommand();
        if (string.IsNullOrWhiteSpace(fileName))
        {
            message = "No execution script or managed DLL was found in the runtime folder.";
            AppendLog(message);
            return false;
        }

        AppendLog($"Launching backend using '{fileName}' {string.Join(' ', arguments ?? Array.Empty<string>())}");

        try
        {
            var startInfo = new ProcessStartInfo(fileName)
            {
                WorkingDirectory = _runtimeRoot,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            foreach (var arg in arguments)
            {
                startInfo.ArgumentList.Add(arg);
            }

            _process = Process.Start(startInfo);
            if (_process is null)
            {
                message = $"Failed to start backend process using '{fileName}'.";
                AppendLog(message);
                return false;
            }

            _process.OutputDataReceived += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                {
                    Console.WriteLine(e.Data);
                    AppendLog(e.Data);
                }
            };

            _process.ErrorDataReceived += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                {
                    Console.Error.WriteLine(e.Data);
                    AppendLog("[stderr] " + e.Data);
                }
            };

            _process.BeginOutputReadLine();
            _process.BeginErrorReadLine();
            message = $"Backend started (PID {_process.Id}).";
            AppendLog(message);
            return true;
        }
        catch (Exception ex)
        {
            message = $"Backend failed: {ex.Message}";
            AppendLog(message);
            return false;
        }
    }

    public void Dispose()
    {
        try
        {
            if (_process is { HasExited: false })
            {
                _process.Kill(true);
            }
        }
        catch
        {
            // ignored
        }
        finally
        {
            _process?.Dispose();
        }
    }

    private (string? FileName, IReadOnlyList<string> Arguments) ResolveCommand()
    {
        var overridePath = ResolveExecutionOverride();
        if (!string.IsNullOrWhiteSpace(overridePath))
        {
            return (overridePath, Array.Empty<string>());
        }

        var native = ResolveNativeExecutable();
        if (!string.IsNullOrWhiteSpace(native))
        {
            return (native, Array.Empty<string>());
        }

        var runtimeConfig = Directory.EnumerateFiles(_runtimeRoot, "*.runtimeconfig.json").FirstOrDefault();
        string? dll = null;
        if (!string.IsNullOrWhiteSpace(runtimeConfig))
        {
            var baseName = Path.GetFileName(runtimeConfig) ?? string.Empty;
            if (baseName.EndsWith(".runtimeconfig.json", StringComparison.OrdinalIgnoreCase))
            {
                baseName = baseName[..^".runtimeconfig.json".Length];
            }
            else
            {
                baseName = Path.GetFileNameWithoutExtension(runtimeConfig);
            }

            var candidate = Path.Combine(_runtimeRoot, $"{baseName}.dll");
            if (File.Exists(candidate))
            {
                dll = candidate;
            }
        }

        dll ??= Directory.EnumerateFiles(_runtimeRoot, "*.dll").FirstOrDefault();
        if (dll is null)
        {
            return (null, Array.Empty<string>());
        }

        var dotnet = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "dotnet.exe" : "dotnet";
        return (dotnet, new[] { dll });
    }

    private string? ResolveNativeExecutable()
    {
        try
        {
            var files = Directory.EnumerateFiles(_runtimeRoot).ToArray();
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                var exe = files.FirstOrDefault(f => f.EndsWith(".exe", StringComparison.OrdinalIgnoreCase));
                return exe;
            }

            string? best = null;
            foreach (var file in files)
            {
                var name = Path.GetFileName(file) ?? string.Empty;
                if (name.EndsWith(".dylib", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (name.Contains('.'))
                {
                    continue;
                }

                best = file;
                if (HasExecutePermission(file))
                {
                    break;
                }
            }

            if (best is not null)
            {
                EnsureExecutable(best);
                return best;
            }
        }
        catch
        {
            // ignored
        }

        return null;
    }

    private string? ResolveExecutionOverride()
    {
        var overrideCandidate = _launchConfig.ExecutionScript?.Trim();
        if (string.IsNullOrWhiteSpace(overrideCandidate))
        {
            return null;
        }

        var searchRoots = new List<string>();
        if (Path.IsPathRooted(overrideCandidate))
        {
            searchRoots.Add(Path.GetDirectoryName(overrideCandidate) ?? string.Empty);
        }
        else
        {
            searchRoots.Add(_runtimeRoot);
            var macOsRoot = Path.GetDirectoryName(_runtimeRoot);
            if (!string.IsNullOrWhiteSpace(macOsRoot))
            {
                searchRoots.Add(macOsRoot);
            }
        }

        foreach (var root in searchRoots)
        {
            if (string.IsNullOrWhiteSpace(root))
            {
                continue;
            }

            var candidate = Path.IsPathRooted(overrideCandidate)
                ? overrideCandidate
                : Path.Combine(root, overrideCandidate);

            AppendLog($"Checking executionScript candidate: {candidate}");

            if (!File.Exists(candidate))
            {
                continue;
            }

            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                EnsureExecutable(candidate);
            }

            return candidate;
        }

        return null;
    }

    private static bool HasExecutePermission(string path)
    {
        try
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                return path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase);
            }

            var mode = File.GetUnixFileMode(path);
            return (mode & UnixFileMode.UserExecute) != 0
                   || (mode & UnixFileMode.GroupExecute) != 0
                   || (mode & UnixFileMode.OtherExecute) != 0;
        }
        catch
        {
            return false;
        }
    }

    private void AppendLog(string text)
    {
        _logger(text);
    }

    private static void EnsureExecutable(string path)
    {
        try
        {
            var mode = File.GetUnixFileMode(path);
            mode |= UnixFileMode.UserExecute | UnixFileMode.GroupExecute | UnixFileMode.OtherExecute;
            File.SetUnixFileMode(path, mode);
        }
        catch
        {
            // best effort
        }
    }
}
