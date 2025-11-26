using System.Collections.Generic;
namespace Electronifier.Desktop.ViewModels;

public sealed class CompileGuidanceViewModel : ViewModelBase
{
    private string _copyStatusMessage = string.Empty;
    private CompileTargetInfo _selectedTarget;

    public CompileGuidanceViewModel()
    {
        Targets = new List<CompileTargetInfo>
        {
            new("Linux", "dotnet publish <path to project file> -c Release -r linux-x64 --self-contained true -o publish/linux-x64"),
            new("macOS", "dotnet publish <path to project file> -c Release -r osx-x64 --self-contained true -o publish/osx-x64"),
            new("Windows", "dotnet publish <path to project file> -c Release -r win-x64 --self-contained true -o publish/win-x64")
        };

        _selectedTarget = Targets[0];
    }

    public IReadOnlyList<CompileTargetInfo> Targets { get; }

    public CompileTargetInfo SelectedTarget
    {
        get => _selectedTarget;
        set
        {
            if (value is null || value == _selectedTarget)
            {
                return;
            }

            if (SetProperty(ref _selectedTarget, value))
            {
                OnPropertyChanged(nameof(SelectedSnippet));
                CopyStatusMessage = string.Empty;
            }
        }
    }

    public string SelectedSnippet => SelectedTarget?.Snippet ?? string.Empty;

    public string CopyStatusMessage
    {
        get => _copyStatusMessage;
        set => SetProperty(ref _copyStatusMessage, value);
    }
}

public sealed class CompileTargetInfo
{
    public string Name { get; }
    public string Snippet { get; }

    public CompileTargetInfo(string name, string snippet)
    {
        Name = name;
        Snippet = snippet;
    }

    public override string ToString() => Name;
}
