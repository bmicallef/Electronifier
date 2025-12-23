using System.Diagnostics;
using System.Linq;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;

namespace PhotinoWrapper;

/// <summary>
/// Captures detailed diagnostic information about backend startup for debugging.
/// </summary>
internal sealed class DiagnosticInfo
{
    public bool CommandResolved { get; set; }
    public string? CommandPath { get; set; }
    public string? CommandArguments { get; set; }
    public bool FileExists { get; set; }
    public bool IsExecutable { get; set; }
    public bool PortInUseBeforeStart { get; set; }
    public int? PortNumber { get; set; }
    public bool ProcessStarted { get; set; }
    public int? ProcessId { get; set; }
    public bool ProcessExitedEarly { get; set; }
    public int? ProcessExitCode { get; set; }
    public string? RuntimeRootPath { get; set; }
    public bool RuntimeRootExists { get; set; }
    public List<string> RecentOutput { get; } = new();
    public string? StartupErrorMessage { get; set; }
}

/// <summary>
/// A ring buffer to capture recent process output lines.
/// </summary>
internal sealed class OutputBuffer
{
    private readonly Queue<string> _lines = new();
    private readonly int _maxLines;
    private readonly object _lock = new();

    public OutputBuffer(int maxLines = 50)
    {
        _maxLines = maxLines;
    }

    public void Append(string line)
    {
        lock (_lock)
        {
            _lines.Enqueue(line);
            while (_lines.Count > _maxLines)
            {
                _lines.Dequeue();
            }
        }
    }

    public List<string> GetLines()
    {
        lock (_lock)
        {
            return _lines.ToList();
        }
    }
}

internal sealed class ServerProcessManager : IDisposable
{
    private readonly string _appRoot;
    private readonly LaunchConfig _launchConfig;
    private readonly string _runtimeRoot;
    private readonly Action<string> _logger;
    private readonly OutputBuffer _outputBuffer = new(50);
    private readonly DiagnosticInfo _diagnostics = new();
    private Process? _process;

    public ServerProcessManager(string appRoot, LaunchConfig launchConfig, Action<string> logger)
    {
        _appRoot = appRoot;
        _launchConfig = launchConfig;
        _runtimeRoot = Path.Combine(appRoot, "runtime");
        _logger = logger ?? (_ => { });
        
        // Initialize diagnostic info
        _diagnostics.RuntimeRootPath = _runtimeRoot;
        _diagnostics.RuntimeRootExists = Directory.Exists(_runtimeRoot);
    }

    /// <summary>
    /// Returns the diagnostic information collected during startup attempts.
    /// </summary>
    public DiagnosticInfo GetDiagnostics()
    {
        // Populate recent output from buffer
        _diagnostics.RecentOutput.Clear();
        _diagnostics.RecentOutput.AddRange(_outputBuffer.GetLines());
        
        // Check if process exited early
        if (_process is not null)
        {
            try
            {
                if (_process.HasExited)
                {
                    _diagnostics.ProcessExitedEarly = true;
                    _diagnostics.ProcessExitCode = _process.ExitCode;
                }
            }
            catch
            {
                // Process may have already been disposed
            }
        }
        
        return _diagnostics;
    }

    /// <summary>
    /// Checks if the target port is already in use before we attempt to start the backend.
    /// </summary>
    public void CheckInitialPortStatus(string? entryUrl)
    {
        if (string.IsNullOrWhiteSpace(entryUrl))
        {
            return;
        }

        if (!TryExtractPortFromUrl(entryUrl, out var host, out var port))
        {
            return;
        }

        _diagnostics.PortNumber = port;
        _diagnostics.PortInUseBeforeStart = IsPortAvailable(host, port);
        
        if (_diagnostics.PortInUseBeforeStart)
        {
            AppendLog($"Port {port} is already in use before starting backend.");
        }
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

    public async Task<bool> WaitForPortAsync(string? entryUrl, int maxWaitSeconds = 30)
    {
        if (string.IsNullOrWhiteSpace(entryUrl))
        {
            return true;
        }

        if (!TryExtractPortFromUrl(entryUrl, out var host, out var port))
        {
            AppendLog($"Could not extract port from URL '{entryUrl}', skipping port check.");
            return true;
        }

        AppendLog($"Waiting for {host}:{port} to become available (max {maxWaitSeconds}s)...");
        var startTime = DateTime.UtcNow;
        var delay = 100;
        var maxDelay = 2000;

        while ((DateTime.UtcNow - startTime).TotalSeconds < maxWaitSeconds)
        {
            if (IsPortAvailable(host, port))
            {
                var elapsed = (DateTime.UtcNow - startTime).TotalSeconds;
                AppendLog($"Port {host}:{port} is available after {elapsed:F1}s.");
                return true;
            }

            await Task.Delay(delay).ConfigureAwait(false);
            delay = Math.Min(delay * 2, maxDelay);
        }

        var totalWait = (DateTime.UtcNow - startTime).TotalSeconds;
        AppendLog($"Port {host}:{port} did not become available after {totalWait:F1}s.");
        return false;
    }

    private static bool TryExtractPortFromUrl(string url, out string host, out int port)
    {
        host = "localhost";
        port = 0;

        try
        {
            var uri = new Uri(url);
            host = uri.Host;
            port = uri.Port;

            if (port <= 0 || port > 65535)
            {
                return false;
            }

            return true;
        }
        catch
        {
            return false;
        }
    }

    private bool IsPortAvailable(string host, int port)
    {
        try
        {
            using var client = new System.Net.Sockets.TcpClient();
            var connectTask = client.ConnectAsync(host, port);
            var completed = connectTask.Wait(TimeSpan.FromMilliseconds(500));
            
            if (completed && client.Connected)
            {
                return true;
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    public void KillProcessesUsingPort(string? entryUrl)
    {
        if (string.IsNullOrWhiteSpace(entryUrl))
        {
            return;
        }

        if (!TryExtractPortFromUrl(entryUrl, out var host, out var port))
        {
            AppendLog($"Could not extract port from URL '{entryUrl}', skipping port cleanup.");
            return;
        }

        try
        {
            AppendLog($"Checking for processes using port {port}...");
            
            // Use lsof to find processes using the port (works on macOS and Linux)
            var lsofStartInfo = new ProcessStartInfo
            {
                FileName = "lsof",
                Arguments = $"-ti :{port}",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var lsofProcess = Process.Start(lsofStartInfo);
            if (lsofProcess == null)
            {
                AppendLog("Could not start lsof to check for port usage.");
                return;
            }

            var output = lsofProcess.StandardOutput.ReadToEnd();
            lsofProcess.WaitForExit();

            if (string.IsNullOrWhiteSpace(output))
            {
                AppendLog($"No processes found using port {port}.");
                return;
            }

            var pids = output.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var pidStr in pids)
            {
                if (int.TryParse(pidStr.Trim(), out var pid))
                {
                    try
                    {
                        var process = Process.GetProcessById(pid);
                        AppendLog($"Killing process {pid} ({process.ProcessName}) using port {port}...");
                        process.Kill(true);
                        process.WaitForExit(2000);
                        AppendLog($"Successfully killed process {pid}.");
                    }
                    catch (Exception ex)
                    {
                        AppendLog($"Failed to kill process {pid}: {ex.Message}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog($"Error during port cleanup: {ex.Message}");
        }
    }

    public bool TryStart(out string message)
    {
        _diagnostics.RuntimeRootExists = Directory.Exists(_runtimeRoot);
        
        if (!_diagnostics.RuntimeRootExists)
        {
            message = $"Managed runtime not found at {_runtimeRoot}.";
            _diagnostics.StartupErrorMessage = message;
            AppendLog(message);
            return false;
        }

        var (fileName, arguments) = ResolveCommand();
        _diagnostics.CommandPath = fileName;
        _diagnostics.CommandArguments = arguments != null ? string.Join(" ", arguments) : null;
        _diagnostics.CommandResolved = !string.IsNullOrWhiteSpace(fileName);
        
        if (!_diagnostics.CommandResolved)
        {
            message = "No execution script or managed DLL was found in the runtime folder.";
            _diagnostics.StartupErrorMessage = message;
            AppendLog(message);
            return false;
        }

        // Check if file exists and is executable
        _diagnostics.FileExists = File.Exists(fileName);
        if (!_diagnostics.FileExists)
        {
            // Check if it's a system command like 'dotnet'
            _diagnostics.FileExists = IsSystemCommand(fileName!);
        }
        
        if (_diagnostics.FileExists && !RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            _diagnostics.IsExecutable = HasExecutePermission(fileName!);
        }
        else
        {
            _diagnostics.IsExecutable = _diagnostics.FileExists; // On Windows, just check existence
        }

        AppendLog($"Launching backend using '{fileName}' {string.Join(' ', arguments ?? Array.Empty<string>())}");
        AppendLog($"  File exists: {_diagnostics.FileExists}, Executable: {_diagnostics.IsExecutable}");

        try
        {
            var startInfo = new ProcessStartInfo(fileName!)
            {
                WorkingDirectory = _runtimeRoot,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            foreach (var arg in arguments ?? Array.Empty<string>())
            {
                startInfo.ArgumentList.Add(arg);
            }

            _process = Process.Start(startInfo);
            if (_process is null)
            {
                message = $"Failed to start backend process using '{fileName}'.";
                _diagnostics.StartupErrorMessage = message;
                _diagnostics.ProcessStarted = false;
                AppendLog(message);
                return false;
            }

            _diagnostics.ProcessStarted = true;
            _diagnostics.ProcessId = _process.Id;

            _process.OutputDataReceived += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                {
                    Console.WriteLine(e.Data);
                    AppendLog(e.Data);
                    _outputBuffer.Append(e.Data);
                }
            };

            _process.ErrorDataReceived += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                {
                    Console.Error.WriteLine(e.Data);
                    var errorLine = "[stderr] " + e.Data;
                    AppendLog(errorLine);
                    _outputBuffer.Append(errorLine);
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
            _diagnostics.StartupErrorMessage = message;
            _diagnostics.ProcessStarted = false;
            AppendLog(message);
            return false;
        }
    }

    private static bool IsSystemCommand(string fileName)
    {
        // Check if this is a system command like 'dotnet'
        var command = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(command))
        {
            return false;
        }

        try
        {
            // Try to find the command in PATH
            var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
            var separator = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? ';' : ':';
            var paths = pathEnv.Split(separator);
            
            foreach (var path in paths)
            {
                if (string.IsNullOrWhiteSpace(path)) continue;
                
                var fullPath = Path.Combine(path, command);
                if (File.Exists(fullPath))
                {
                    return true;
                }
                
                // On Windows, also check with .exe extension
                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    if (File.Exists(fullPath + ".exe"))
                    {
                        return true;
                    }
                }
            }
        }
        catch
        {
            // Ignore errors in PATH lookup
        }

        return false;
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
