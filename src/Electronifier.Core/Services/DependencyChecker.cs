using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace Electronifier.Core.Services;

public sealed class DependencyChecker
{
    private readonly DependencyRequirement[] _requirements =
    {
        new("Dotnet SDK", "dotnet", new[] { "--version" }, "Install the .NET SDK to build Photino wrappers."),
        new("Photino Templates", "templates-check", Array.Empty<string>(), "Photino wrapper templates are missing. Reinstall Electronifier or ensure templates/PhotinoWrapper directory exists.")
    };

    public async Task<IReadOnlyList<DependencyRequirementStatus>> ProbeAsync(CancellationToken cancellationToken = default)
    {
        var results = new List<DependencyRequirementStatus>(capacity: _requirements.Length);
        foreach (var requirement in _requirements)
        {
            cancellationToken.ThrowIfCancellationRequested();
            results.Add(await CheckRequirementAsync(requirement, cancellationToken).ConfigureAwait(false));
        }

        return results;
    }

    private static async Task<DependencyRequirementStatus> CheckRequirementAsync(DependencyRequirement requirement, CancellationToken cancellationToken)
    {
        // Special handling for Photino templates check
        if (requirement.Command == "templates-check")
        {
            return CheckPhotinoTemplates(requirement);
        }

        var startInfo = new ProcessStartInfo(requirement.Command)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            ArgumentList = { },
            UseShellExecute = false,
            CreateNoWindow = true
        };

        foreach (var argument in requirement.Arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        try
        {
            using var process = Process.Start(startInfo);
            if (process is null)
            {
                return DependencyRequirementStatus.Missing(requirement);
            }

            await Task.WhenAll(
                process.StandardOutput.ReadToEndAsync(),
                process.StandardError.ReadToEndAsync(),
                process.WaitForExitAsync(cancellationToken)).ConfigureAwait(false);

            return process.ExitCode == 0
                ? DependencyRequirementStatus.Installed(requirement)
                : DependencyRequirementStatus.Missing(requirement, "Command returned a non-zero exit code.");
        }
        catch (Win32Exception)
        {
            return DependencyRequirementStatus.Missing(requirement, "Executable was not found.");
        }
        catch (Exception ex)
        {
            return DependencyRequirementStatus.Unknown(requirement, ex.Message);
        }
    }

    private static DependencyRequirementStatus CheckPhotinoTemplates(DependencyRequirement requirement)
    {
        var baseDir = AppContext.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(baseDir, "templates", "PhotinoWrapper"),
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "templates", "PhotinoWrapper")),
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "..", "src", "Electronifier.Core", "templates", "PhotinoWrapper")),
            Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "templates", "PhotinoWrapper")),
            Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "src", "Electronifier.Core", "templates", "PhotinoWrapper"))
        };

        var match = candidates.FirstOrDefault(Directory.Exists);
        if (match is not null)
        {
            return DependencyRequirementStatus.Installed(requirement);
        }

        return DependencyRequirementStatus.Missing(requirement, "Template directory not found in any expected location.");
    }
}
