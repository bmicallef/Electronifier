namespace Electronifier.Core.Models;

public class ProjectDefinition
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = "1.0.0";
    public string Description { get; set; } = string.Empty;
    public string Namespace { get; set; } = string.Empty;
    public string Organization { get; set; } = string.Empty;
    public string Author { get; set; } = string.Empty;
    public string SupportUrl { get; set; } = string.Empty;
    public string SupportEmail { get; set; } = string.Empty;

    public string IconPath { get; set; } = string.Empty;
    public string BinPath { get; set; } = string.Empty;
    public string MacBinPath { get; set; } = string.Empty;
    public string MacBinPathX86 { get; set; } = string.Empty;
    public string WindowsBinPath { get; set; } = string.Empty;
    public string WindowsBinPathX86 { get; set; } = string.Empty;
    public string LinuxBinPath { get; set; } = string.Empty;

    public ProjectPublicationSettings PublicationSettings { get; set; } = new();
    public List<ProjectRelease> Releases { get; set; } = new();
}
