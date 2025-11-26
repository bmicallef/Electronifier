namespace Electronifier.Core.Models;

public class ProjectPublicationSettings
{
    public List<PlatformTarget> DefaultPlatformTargets { get; set; } = new()
    {
        PlatformTarget.macOS,
        PlatformTarget.Windows,
        PlatformTarget.Linux
    };

    public List<PublicationDestination> PublicationTargets { get; set; } = new();
    public LaunchOptions LaunchConfiguration { get; set; } = new();
    public string ExecutionScript { get; set; } = string.Empty;
}
