using System.Linq;

namespace Electronifier.Core.Services;

public sealed class DependencyRequirement
{
    public string Name { get; }
    public string Command { get; }
    public string[] Arguments { get; }
    public string InstallHint { get; }

    public DependencyRequirement(string name, string command, IEnumerable<string> arguments, string installHint)
    {
        Name = name;
        Command = command;
        Arguments = arguments.ToArray();
        InstallHint = installHint;
    }
}

public sealed record DependencyRequirementStatus(DependencyRequirement Requirement, DependencyStatus Status, string Details)
{
    public static DependencyRequirementStatus Installed(DependencyRequirement requirement)
        => new(requirement, DependencyStatus.Installed, "Detected on disk.");

    public static DependencyRequirementStatus Missing(DependencyRequirement requirement, string? details = null)
        => new(requirement, DependencyStatus.Missing, details ?? "Required executable is missing.");

    public static DependencyRequirementStatus Unknown(DependencyRequirement requirement, string? details = null)
        => new(requirement, DependencyStatus.Unknown, details ?? "Unable to determine the requirement status.");
}

public enum DependencyStatus
{
    Unknown,
    Installed,
    Missing
}
