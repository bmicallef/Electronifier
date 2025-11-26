using System;
using Electronifier.Core.Services;

namespace Electronifier.Desktop.ViewModels;

public sealed class DependencyRequirementStatusViewModel : ViewModelBase
{
    private readonly DependencyRequirementStatus _status;

    public DependencyRequirementStatusViewModel(DependencyRequirementStatus status)
    {
        _status = status ?? throw new ArgumentNullException(nameof(status));
    }

    public string Name => _status.Requirement.Name;
    public string Details => _status.Details;
    public string InstallHint => _status.Requirement.InstallHint;
    public DependencyStatus Status => _status.Status;

    public bool IsInstalled => Status == DependencyStatus.Installed;
    public bool IsMissing => Status == DependencyStatus.Missing;

    public string ForegroundColor => IsMissing ? "#DC2626" : "#059669";
}
