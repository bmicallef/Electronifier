using Electronifier.Core.Models;

namespace Electronifier.Core.Storage;

public sealed class AppState
{
    public List<ProjectDefinition> Projects { get; set; } = new();
}
