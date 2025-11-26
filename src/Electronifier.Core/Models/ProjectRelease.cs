namespace Electronifier.Core.Models;

public class ProjectRelease
{
    public string Version { get; set; } = string.Empty;
    public string ReleaseNotes { get; set; } = string.Empty;
    public string SplashImagePath { get; set; } = string.Empty;
    public List<PlatformTarget> Platforms { get; set; } = new();
    public PublicationDestination? PublicationDestination { get; set; }
    public string SourceBinPath { get; set; } = string.Empty;
    public DateTimeOffset? PublishedAt { get; set; }
}
