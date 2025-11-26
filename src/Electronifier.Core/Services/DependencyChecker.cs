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
        new("Dotnet SDK", "dotnet", new[] { "--version" }, "Install the .NET SDK to build Photino wrappers.")
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
}
