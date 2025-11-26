using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Electronifier.Core.Services;

public sealed class DependencyInstallationPlan
{
    public string Command { get; }
    public IReadOnlyList<string> Arguments { get; }
    public bool RequiresSudo { get; }
    public string Description { get; }

    public DependencyInstallationPlan(string command, IEnumerable<string> arguments, string description, bool requiresSudo = false)
    {
        Command = command;
        Arguments = arguments.ToArray();
        RequiresSudo = requiresSudo;
        Description = description;
    }
}

public sealed class DependencyInstallResult
{
    public bool Success { get; }
    public bool NeedsPassword { get; }
    public string Message { get; }

    public DependencyInstallResult(bool success, bool needsPassword, string message)
    {
        Success = success;
        NeedsPassword = needsPassword;
        Message = message;
    }
}

public sealed class DependencyInstaller
{
    public async Task<DependencyInstallResult> InstallAsync(DependencyRequirement requirement, string? adminPassword = null, CancellationToken cancellationToken = default)
    {
        var plans = BuildPlans(requirement);
        if (!plans.Any())
        {
            return new DependencyInstallResult(false, false, $"No automated install plan for {requirement.Name}.");
        }

        foreach (var plan in plans)
        {
            var info = BuildStartInfo(plan);
            try
            {
                using var process = Process.Start(info);
                if (process is null)
                {
                    return new DependencyInstallResult(false, false, $"Unable to start install command for {requirement.Name}.");
                }

                if (plan.RequiresSudo && !string.IsNullOrEmpty(adminPassword))
                {
                    await process.StandardInput.WriteLineAsync(adminPassword).ConfigureAwait(false);
                    process.StandardInput.Close();
                }

                var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
                var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
                await Task.WhenAll(outputTask, errorTask, process.WaitForExitAsync(cancellationToken)).ConfigureAwait(false);

                if (process.ExitCode != 0)
                {
                    if (plan.RequiresSudo && string.IsNullOrEmpty(adminPassword))
                    {
                        return new DependencyInstallResult(false, true, $"{plan.Description} requires administrator credentials.");
                    }

                    var error = await errorTask.ConfigureAwait(false);
                    return new DependencyInstallResult(false, false, string.IsNullOrWhiteSpace(error)
                        ? $"Installation of {requirement.Name} failed with exit code {process.ExitCode}."
                        : error);
                }
            }
            catch (Exception ex)
            {
                return new DependencyInstallResult(false, false, ex.Message);
            }
        }

        return new DependencyInstallResult(true, false, $"Automated installation of {requirement.Name} finished.");
    }

    private static ProcessStartInfo BuildStartInfo(DependencyInstallationPlan plan)
    {
        var command = plan.RequiresSudo ? "sudo" : plan.Command;
        var startInfo = new ProcessStartInfo(command)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = plan.RequiresSudo,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        if (plan.RequiresSudo)
        {
            startInfo.ArgumentList.Add("-S");
            startInfo.ArgumentList.Add(plan.Command);
        }

        foreach (var arg in plan.Arguments)
        {
            startInfo.ArgumentList.Add(arg);
        }

        return startInfo;
    }

    private static IEnumerable<DependencyInstallationPlan> BuildPlans(DependencyRequirement requirement)
    {
        if (requirement.Name.Contains("dotnet", StringComparison.OrdinalIgnoreCase))
        {
            if (OperatingSystem.IsWindows())
            {
                var installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) ?? ".", ".dotnet");
                var command = "powershell";
                var script = $"& {{ iwr https://dot.net/v1/dotnet-install.ps1 -OutFile dotnet-install.ps1; ./dotnet-install.ps1 -Channel LTS -InstallDir '{installDir}' }}";
                var args = new[]
                {
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    script
                };

                return new[]
                {
                    new DependencyInstallationPlan(command, args, "Install .NET SDK via dotnet-install script")
                };
            }

            if (OperatingSystem.IsMacOS() || OperatingSystem.IsLinux())
            {
                var installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal) ?? ".", ".dotnet");
                var scriptCmd = $"curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- -Channel LTS -InstallDir {installDir}";
                return new[]
                {
                    new DependencyInstallationPlan("bash", new[] { "-c", scriptCmd }, "Install .NET SDK via dotnet-install script")
                };
            }
        }

        return Array.Empty<DependencyInstallationPlan>();
    }
}
