using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using Avalonia.Threading;
using Electronifier.Core.Models;
using Electronifier.Core.Services;
using Electronifier.Core.Storage;

namespace Electronifier.Desktop.ViewModels;

public enum ApplicationStage
{
    Splash,
    Dependencies,
    Projects,
    NewProject
}

public sealed class MainWindowViewModel : ViewModelBase
{
    private readonly AppStateRepository _repository;
    private readonly DependencyChecker _dependencyChecker = new();
    private readonly DependencyInstaller _dependencyInstaller = new();
    private readonly RelayCommand _saveCommand;
    private readonly RelayCommand _addPublicationTargetCommand;
    private readonly RelayCommand _removePublicationTargetCommand;
    private readonly RelayCommand _refreshDependenciesCommand;
    private readonly RelayCommand _createReleaseCommand;
    private readonly RelayCommand _createProjectCommand;
    private readonly RelayCommand _editProjectCommand;
    private readonly RelayCommand _addReleaseCommand;
    private readonly RelayCommand _saveNewProjectCommand;
    private readonly RelayCommand _cancelProjectFormCommand;
    private readonly ReleaseAutomationService _releaseAutomationService = new();
    private const int MaxPublishLogEntries = 20;

    private AppState _state = new();
    private ApplicationStage _stage = ApplicationStage.Splash;
    private ProjectDefinitionViewModel? _selectedProject;
    private ProjectDefinitionViewModel? _activeReleaseProject;
    private ProjectDefinitionViewModel? _newProjectDraft;
    private bool _isEditingExistingProject;
    private string _statusMessage = string.Empty;
    private string _dependencyInstruction = string.Empty;
    private bool _isCheckingDependencies;
    private bool _requiresAdminPassword;
    private string _adminPassword = string.Empty;
    private bool _isProjectDirty;
    private bool _isReleasing;
    private string _releaseStatusMessage = string.Empty;
    private double _releaseProgress;
    private bool _releaseSucceeded;
    private ProjectDefinitionViewModel? _trackedProjectForDirty;
    private PropertyChangedEventHandler? _projectPropertyChangedHandler;
    private NotifyCollectionChangedEventHandler? _publicationTargetsChangedHandler;
    private readonly List<PublicationDestinationViewModel> _trackedDestinations = new();
    private readonly PropertyChangedEventHandler _destinationPropertyChangedHandler;
    private PropertyChangedEventHandler? _launchOptionsPropertyChangedHandler;

    public MainWindowViewModel()
    {
        _repository = new AppStateRepository();
        Projects = new ObservableCollection<ProjectDefinitionViewModel>();
        DependencyStatuses = new ObservableCollection<DependencyRequirementStatusViewModel>();

        _createProjectCommand = new RelayCommand(_ => StartCreatingProject());
        _editProjectCommand = new RelayCommand(obj => StartEditingProject(obj as ProjectDefinitionViewModel));
        _addReleaseCommand = new RelayCommand(obj => QueueRelease(obj as ProjectDefinitionViewModel),
            obj => CanQueueRelease(obj as ProjectDefinitionViewModel));
        _saveNewProjectCommand = new RelayCommand(_ => _ = SaveNewProjectAsync(), _ => IsProjectDirty);
        _cancelProjectFormCommand = new RelayCommand(_ => CancelProjectForm());
        _saveCommand = new RelayCommand(_ => _ = SaveStateAsync(), _ => Projects.Any());
        _addPublicationTargetCommand = new RelayCommand(_ => AddPublicationTarget(), _ => GetActiveProject() is not null);
        _removePublicationTargetCommand = new RelayCommand(obj => RemovePublicationTarget(obj as PublicationDestinationViewModel), _ => GetActiveProject() is not null);
        _refreshDependenciesCommand = new RelayCommand(_ => _ = RefreshDependenciesAsync(), _ => !IsCheckingDependencies);
        _createReleaseCommand = new RelayCommand(_ => CreateRelease(), _ => CanCreateRelease());

        Projects.CollectionChanged += (_, _) => _saveCommand.RaiseCanExecuteChanged();
        _destinationPropertyChangedHandler = (_, _) => MarkProjectDirty();
        PublishLogs.CollectionChanged += PublishLogsOnCollectionChanged;
        _ = Dispatcher.UIThread.InvokeAsync(async () =>
        {
            await InitializeAsync();
        });
    }

    public ObservableCollection<ProjectDefinitionViewModel> Projects { get; }
    public ObservableCollection<DependencyRequirementStatusViewModel> DependencyStatuses { get; }
    public ObservableCollection<string> PublishLogs { get; } = new();
    public string PublishDiagnosticText => string.Join(Environment.NewLine, PublishLogs);
    public ICommand SaveStateCommand => _saveCommand;
    public ICommand AddPublicationTargetCommand => _addPublicationTargetCommand;
    public ICommand RefreshDependenciesCommand => _refreshDependenciesCommand;
    public ICommand CreateReleaseCommand => _createReleaseCommand;
    public ICommand CreateProjectCommand => _createProjectCommand;
    public ICommand EditProjectCommand => _editProjectCommand;
    public ICommand AddReleaseCommand => _addReleaseCommand;
    public ICommand SaveNewProjectCommand => _saveNewProjectCommand;
    public ICommand CancelProjectFormCommand => _cancelProjectFormCommand;
    public ICommand RemovePublicationTargetCommand => _removePublicationTargetCommand;

        public ProjectDefinitionViewModel? SelectedProject
        {
            get => _selectedProject;
            set
            {
                if (SetProperty(ref _selectedProject, value))
                {
                    UpdatePublicationTargetCommandState();
                    UpdateReleaseCommandState();
                    _createReleaseCommand.RaiseCanExecuteChanged();
                }
            }
        }

    public ProjectDefinitionViewModel? ActiveReleaseProject
    {
        get => _activeReleaseProject;
        private set
        {
            if (_activeReleaseProject == value)
            {
                return;
            }

            if (_activeReleaseProject is not null)
            {
                _activeReleaseProject.IsReleaseTarget = false;
            }

            _activeReleaseProject = value;

            if (_activeReleaseProject is not null)
            {
                _activeReleaseProject.IsReleaseTarget = true;
            }

            OnPropertyChanged();
        }
    }

    public ProjectDefinitionViewModel? NewProjectDraft
    {
        get => _newProjectDraft;
        private set
        {
            if (SetProperty(ref _newProjectDraft, value))
            {
                AttachDirtyTracking(value);
                UpdatePublicationTargetCommandState();
            }
        }
    }

    public bool IsProjectDirty
    {
        get => _isProjectDirty;
        private set
        {
            if (SetProperty(ref _isProjectDirty, value))
            {
                _saveNewProjectCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public ApplicationStage Stage
    {
        get => _stage;
        private set => SetStageValue(value);
    }

    private void SetStageValue(ApplicationStage stage)
    {
        if (SetProperty(ref _stage, stage))
        {
            OnPropertyChanged(nameof(IsSplash));
            OnPropertyChanged(nameof(IsDependencyStage));
            OnPropertyChanged(nameof(IsProjectsStage));
            OnPropertyChanged(nameof(IsNewProjectStage));
            UpdatePublicationTargetCommandState();
            UpdateReleaseCommandState();
            _createReleaseCommand.RaiseCanExecuteChanged();
        }
    }

    public bool IsSplash => Stage == ApplicationStage.Splash;
    public bool IsDependencyStage => Stage == ApplicationStage.Dependencies;
    public bool IsProjectsStage => Stage == ApplicationStage.Projects;
    public bool IsNewProjectStage => Stage == ApplicationStage.NewProject;

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetProperty(ref _statusMessage, value);
    }

    public void ReportStatus(string message)
    {
        StatusMessage = message;
    }

    public string DependencyInstruction
    {
        get => _dependencyInstruction;
        private set => SetProperty(ref _dependencyInstruction, value);
    }

    public bool IsCheckingDependencies
    {
        get => _isCheckingDependencies;
        private set
        {
            if (SetProperty(ref _isCheckingDependencies, value))
            {
                _refreshDependenciesCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public bool IsReleasing
    {
        get => _isReleasing;
        private set
        {
            if (SetProperty(ref _isReleasing, value))
            {
                _createReleaseCommand.RaiseCanExecuteChanged();
                UpdateReleaseCommandState();
            }
        }
    }

    public string ReleaseStatusMessage
    {
        get => _releaseStatusMessage;
        private set => SetProperty(ref _releaseStatusMessage, value);
    }

    public double ReleaseProgress
    {
        get => _releaseProgress;
        private set
        {
            if (SetProperty(ref _releaseProgress, value))
            {
                OnPropertyChanged(nameof(ReleaseProgressLabel));
            }
        }
    }

    public bool ReleaseSucceeded
    {
        get => _releaseSucceeded;
        private set => SetProperty(ref _releaseSucceeded, value);
    }

    public string ReleaseProgressLabel
        => $"{Math.Round(ReleaseProgress * 100):0}% complete";

    public bool RequiresAdminPassword
    {
        get => _requiresAdminPassword;
        private set => SetProperty(ref _requiresAdminPassword, value);
    }

    public string AdminPassword
    {
        get => _adminPassword;
        set => SetProperty(ref _adminPassword, value);
    }

    public bool HasMissingDependencies => DependencyStatuses.Any(status => status.IsMissing);

    private async Task InitializeAsync()
    {
        Stage = ApplicationStage.Splash;
        await Task.Delay(TimeSpan.FromSeconds(3));
        Stage = ApplicationStage.Dependencies;
        await LoadStateAsync();
        await RefreshDependenciesAsync();
    }

    private async Task LoadStateAsync()
    {
        _state = await _repository.LoadAsync();
        Projects.Clear();

        foreach (var project in _state.Projects)
        {
            Projects.Add(new ProjectDefinitionViewModel(project));
        }

        SelectedProject = Projects.FirstOrDefault();
        StatusMessage = $"Loaded {Projects.Count} project(s).";
    }

    private async Task RefreshDependenciesAsync()
    {
        Stage = ApplicationStage.Dependencies;
        IsCheckingDependencies = true;
        try
        {
            var statuses = await _dependencyChecker.ProbeAsync();
            await AttemptInstallMissingAsync(statuses);
        }
        catch (Exception ex)
        {
            StatusMessage = $"Unable to evaluate dependencies: {ex.Message}";
        }
        finally
        {
            IsCheckingDependencies = false;
        }
    }

    private async Task AttemptInstallMissingAsync(IReadOnlyList<DependencyRequirementStatus> statuses)
    {
        UpdateDependencyStatuses(statuses);
        DependencyInstruction = BuildDependencyInstruction();

        var missing = statuses.Where(status => status.Status == DependencyStatus.Missing).ToList();
        if (!missing.Any())
        {
            Stage = ApplicationStage.Projects;
            return;
        }

        var installed = await InstallMissingDependenciesAsync(missing);
        var refreshed = await _dependencyChecker.ProbeAsync();
        UpdateDependencyStatuses(refreshed);
        DependencyInstruction = BuildDependencyInstruction();
        if (installed)
        {
            Stage = ApplicationStage.Projects;
        }
    }

    private async Task<bool> InstallMissingDependenciesAsync(IReadOnlyList<DependencyRequirementStatus> missing)
    {
        foreach (var status in missing)
        {
            var result = await _dependencyInstaller.InstallAsync(status.Requirement, RequiresAdminPassword ? AdminPassword : null);
            if (!result.Success)
            {
                if (result.NeedsPassword)
                {
                    RequiresAdminPassword = true;
                    DependencyInstruction = result.Message;
                    StatusMessage = $"Administrator access required for {status.Requirement.Name}.";
                    return false;
                }

                StatusMessage = result.Message;
                return false;
            }
        }

        RequiresAdminPassword = false;
        AdminPassword = string.Empty;
        return true;
    }

    private void UpdateDependencyStatuses(IEnumerable<DependencyRequirementStatus> statuses)
    {
        DependencyStatuses.Clear();
        foreach (var status in statuses)
        {
            DependencyStatuses.Add(new DependencyRequirementStatusViewModel(status));
        }

        OnPropertyChanged(nameof(HasMissingDependencies));
        UpdateReleaseCommandState();
    }

    private string BuildDependencyInstruction()
    {
        var missing = DependencyStatuses.Where(status => status.IsMissing).ToList();
        if (missing.Count == 0)
        {
            return "All required tools are present; you are ready to create releases.";
        }

        return $"Missing dependencies:\n{string.Join("\n", missing.Select(m => $"{m.Name}: {m.InstallHint}"))}\nInstall the missing tools to continue.";
    }

    private void UpdatePublicationTargetCommandState()
    {
        _addPublicationTargetCommand.RaiseCanExecuteChanged();
    }

    private void UpdateReleaseCommandState()
    {
        _addReleaseCommand.RaiseCanExecuteChanged();
    }

    private void AttachDirtyTracking(ProjectDefinitionViewModel? project)
    {
        DetachDirtyTracking();
        _trackedProjectForDirty = project;
        if (project is null)
        {
            IsProjectDirty = false;
            return;
        }

        _projectPropertyChangedHandler = (_, _) => MarkProjectDirty();
        project.PropertyChanged += _projectPropertyChangedHandler;

        _publicationTargetsChangedHandler = (_, __) =>
        {
            MarkProjectDirty();
            ReattachDestinationHandlers(project);
        };
        project.PublicationTargets.CollectionChanged += _publicationTargetsChangedHandler;

        ReattachDestinationHandlers(project);
        ReattachLaunchOptionsHandler(project);
        IsProjectDirty = false;
    }

    private void DetachDirtyTracking()
    {
        if (_trackedProjectForDirty is not null)
        {
            if (_projectPropertyChangedHandler is not null)
            {
                _trackedProjectForDirty.PropertyChanged -= _projectPropertyChangedHandler;
                _projectPropertyChangedHandler = null;
            }

            if (_publicationTargetsChangedHandler is not null)
            {
                _trackedProjectForDirty.PublicationTargets.CollectionChanged -= _publicationTargetsChangedHandler;
                _publicationTargetsChangedHandler = null;
            }
            
            if (_launchOptionsPropertyChangedHandler is not null)
            {
                _trackedProjectForDirty.LaunchOptions.PropertyChanged -= _launchOptionsPropertyChangedHandler;
                _launchOptionsPropertyChangedHandler = null;
            }
        }

        foreach (var destination in _trackedDestinations)
        {
            destination.PropertyChanged -= _destinationPropertyChangedHandler;
        }

        _trackedDestinations.Clear();
        _trackedProjectForDirty = null;
    }

    private void ReattachDestinationHandlers(ProjectDefinitionViewModel project)
    {
        foreach (var destination in _trackedDestinations)
        {
            destination.PropertyChanged -= _destinationPropertyChangedHandler;
        }

        _trackedDestinations.Clear();
        foreach (var destination in project.PublicationTargets)
        {
            destination.PropertyChanged += _destinationPropertyChangedHandler;
            _trackedDestinations.Add(destination);
        }
    }

    private void ReattachLaunchOptionsHandler(ProjectDefinitionViewModel project)
    {
        if (_launchOptionsPropertyChangedHandler is not null && _trackedProjectForDirty is not null)
        {
            _trackedProjectForDirty.LaunchOptions.PropertyChanged -= _launchOptionsPropertyChangedHandler;
            _launchOptionsPropertyChangedHandler = null;
        }

        _launchOptionsPropertyChangedHandler = (_, _) => MarkProjectDirty();
        project.LaunchOptions.PropertyChanged += _launchOptionsPropertyChangedHandler;
    }

    private void CreateRelease()
    {
        _ = RunReleaseWorkflowAsync();
    }

    private async Task RunReleaseWorkflowAsync()
    {
        LogPublishActivity("RunReleaseWorkflowAsync invoked.");
        if (!CanCreateRelease())
        {
            LogPublishActivity("RunReleaseWorkflowAsync aborted: prerequisites not satisfied.");
            StatusMessage = "Resolve dependencies and select a project before creating a release.";
            ActiveReleaseProject = null;
            return;
        }

        ReleaseSucceeded = false;

        var project = SelectedProject;
        if (project is null)
        {
            LogPublishActivity("Release workflow aborted: SelectedProject is null.");
            StatusMessage = "Select a project before creating a release.";
            ActiveReleaseProject = null;
            return;
        }

        var target = GetPublicationTarget(project);
        if (target is null)
        {
            LogPublishActivity($"Release workflow aborted: No publication target configured for '{project.Name}'.");
            StatusMessage = "Configure a publication destination before releasing.";
            ActiveReleaseProject = null;
            return;
        }

        if (!HasAnyBinPath(project))
        {
            LogPublishActivity($"Release workflow aborted: Missing platform bin paths for '{project.Name}'.");
            StatusMessage = "Provide a bin folder for at least one platform before releasing.";
            ActiveReleaseProject = null;
            return;
        }

        IsReleasing = true;
        ReleaseStatusMessage = "Starting release workflow...";
        ReleaseProgress = 0;
        var progressReporter = new Progress<ReleaseAutomationProgress>(progress =>
        {
            Dispatcher.UIThread.Post(() =>
            {
                ReleaseStatusMessage = progress.Message;
                ReleaseProgress = progress.Percentage;
            });
        });
        StatusMessage = $"Building release for \"{project.Name}\"...";
        LogPublishActivity($"Building release payload for '{project.Name}'.");
        try
        {
            var release = BuildRelease(project, target.Model);
            ReleaseSucceeded = false;
            LogPublishActivity($"Calling ReleaseAutomationService.PublishAsync for '{project.Name}'.");
            var result = await _releaseAutomationService.PublishAsync(project.Model, release, project.LaunchOptions.Model, progressReporter).ConfigureAwait(false);
            if (result.Success)
            {
                    project.Model.Releases.Add(release);
                    project.NotifyReleaseCountChanged();
                    project.NotifyReleaseMetadataChanged();
                    await SaveStateAsync().ConfigureAwait(false);
                    StatusMessage = $"Release succeeded: {result.Message}";
                    ReleaseStatusMessage = $"Release completed: {result.Message}";
                    ReleaseProgress = 1;
                    ReleaseSucceeded = true;
                    LogPublishActivity($"PublishAsync succeeded for '{project.Name}': {result.Message}");
                }
                else
                {
                    LogPublishActivity($"PublishAsync reported failure for '{project.Name}': {result.Message}");
                    StatusMessage = $"Release failed: {result.Message}";
                    ReleaseStatusMessage = $"Release failed: {result.Message}";
                    ReleaseSucceeded = false;
                }
        }
        catch (Exception ex)
        {
            LogPublishActivity($"RunReleaseWorkflowAsync exception: {ex}");
            StatusMessage = $"Release failed: {ex.Message}";
            ReleaseStatusMessage = $"Release failed: {ex.Message}";
            ReleaseSucceeded = false;
        }
        finally
        {
            IsReleasing = false;
            ActiveReleaseProject = null;
        }
    }

    private static ProjectRelease BuildRelease(ProjectDefinitionViewModel project, PublicationDestination destination)
    {
        var notes = string.IsNullOrWhiteSpace(project.Description)
            ? $"Automated release for {project.Name}."
            : project.Description;

        return new ProjectRelease
        {
            Version = string.IsNullOrWhiteSpace(project.Version) ? "1.0.0" : project.Version,
            ReleaseNotes = notes,
            SplashImagePath = project.IconPath,
            SourceBinPath = project.BinPath,
            Platforms = project.Model.PublicationSettings.DefaultPlatformTargets.ToList(),
            PublicationDestination = ClonePublicationDestination(destination)
        };
    }

    private static PublicationDestination ClonePublicationDestination(PublicationDestination source)
    {
        if (source is null)
        {
            return new PublicationDestination();
        }

        return new PublicationDestination
        {
            Type = source.Type,
            GitHubRepositoryUrl = source.GitHubRepositoryUrl,
            LocalDirectoryPath = source.LocalDirectoryPath,
            GitHubAccessTokenEncrypted = source.GitHubAccessTokenEncrypted
        };
    }

    private bool CanCreateRelease()
    {
        if (!IsProjectsStage || HasMissingDependencies || IsReleasing || SelectedProject is null)
        {
            return false;
        }

        if (!HasAnyBinPath(SelectedProject))
        {
            return false;
        }

        return GetPublicationTarget(SelectedProject) is not null;
    }

    private bool CanQueueRelease(ProjectDefinitionViewModel? project)
    {
        if (project is null)
        {
            return false;
        }

        if (!IsProjectsStage || HasMissingDependencies || IsReleasing)
        {
            return false;
        }

        if (!HasAnyBinPath(project))
        {
            return false;
        }

        return GetPublicationTarget(project) is not null;
    }

    private PublicationDestinationViewModel? GetPublicationTarget(ProjectDefinitionViewModel? project)
    {
        if (project is null)
        {
            return null;
        }

        return project.PublicationTargets.FirstOrDefault(target =>
            target.Type == PublicationDestinationType.LocalDirectory && !string.IsNullOrWhiteSpace(target.LocalDirectoryPath)
            || target.Type == PublicationDestinationType.GitHubRelease && !string.IsNullOrWhiteSpace(target.GitHubRepositoryUrl) && !string.IsNullOrWhiteSpace(target.GitHubAccessToken));
    }

    private void StartCreatingProject()
    {
        NewProjectDraft = new ProjectDefinitionViewModel(new ProjectDefinition());
        _isEditingExistingProject = false;
        Stage = ApplicationStage.NewProject;
    }

    private void StartEditingProject(ProjectDefinitionViewModel? project)
    {
        if (project is null)
        {
            return;
        }

        NewProjectDraft = project;
        _isEditingExistingProject = true;
        Stage = ApplicationStage.NewProject;
    }

    private void QueueRelease(ProjectDefinitionViewModel? project)
    {
        if (project is null)
        {
            LogPublishActivity("Publish button clicked but no project was bound.");
            return;
        }

        if (!CanQueueRelease(project))
        {
            LogPublishActivity($"Publish button click ignored while prerequisites not satisfied for '{project.Name}'.");
            return;
        }

        LogPublishActivity($"Publish button clicked for '{project.Name}'.");
        SelectedProject = project;
        ActiveReleaseProject = project;
        _ = RunReleaseWorkflowAsync();
    }

    private void LogPublishActivity(string message)
    {
        var timestampedEntry = $"{DateTimeOffset.Now:HH:mm:ss} {message}";
        Dispatcher.UIThread.Post(() =>
        {
            if (PublishLogs.Count >= MaxPublishLogEntries)
            {
                PublishLogs.RemoveAt(PublishLogs.Count - 1);
            }

            PublishLogs.Insert(0, timestampedEntry);
        });
    }

    private void PublishLogsOnCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        OnPropertyChanged(nameof(PublishDiagnosticText));
    }

    private void AddPublicationTarget()
    {
        var project = GetActiveProject();
        project?.AddPublicationTarget();
    }

    private void RemovePublicationTarget(PublicationDestinationViewModel? target)
    {
        var project = GetActiveProject();
        project?.RemovePublicationTarget(target);
        MarkProjectDirty();
    }

    private void MarkProjectDirty()
    {
        if (!IsProjectDirty)
        {
            IsProjectDirty = true;
        }
    }

    private ProjectDefinitionViewModel? GetActiveProject()
        => Stage == ApplicationStage.NewProject ? NewProjectDraft : SelectedProject;

    private async Task SaveNewProjectAsync()
    {
        if (NewProjectDraft is null)
        {
            return;
        }

        if (!_isEditingExistingProject)
        {
            Projects.Add(NewProjectDraft);
        }

        await SaveStateAsync();
        Stage = ApplicationStage.Projects;
        NewProjectDraft = null;
    }

    private void CancelProjectForm()
    {
        Stage = ApplicationStage.Projects;
        NewProjectDraft = null;
    }

    private async Task SaveStateAsync()
    {
        _state.Projects = Projects.Select(vm => vm.Model).ToList();
        await _repository.SaveAsync(_state);
        StatusMessage = $"Saved {Projects.Count} project(s) at {DateTimeOffset.Now:T}.";
        _saveCommand.RaiseCanExecuteChanged();
    }

    private static bool HasAnyBinPath(ProjectDefinitionViewModel project)
        => !string.IsNullOrWhiteSpace(project.MacBinPath)
           || !string.IsNullOrWhiteSpace(project.WindowsBinPath)
           || !string.IsNullOrWhiteSpace(project.LinuxBinPath)
           || !string.IsNullOrWhiteSpace(project.BinPath);

    public string StoreProjectIcon(ProjectDefinitionViewModel project, string sourcePath)
    {
        if (project is null || string.IsNullOrWhiteSpace(sourcePath) || !File.Exists(sourcePath))
        {
            return project?.IconPath ?? string.Empty;
        }

        var iconsDirectory = Path.Combine(_repository.ConfigurationDirectory, "icons");
        Directory.CreateDirectory(iconsDirectory);
        var extension = Path.GetExtension(sourcePath);
        var destination = Path.Combine(iconsDirectory, $"{project.Id}{extension}");
        var normalizedSource = Path.GetFullPath(sourcePath);
        var normalizedDestination = Path.GetFullPath(destination);
        if (!string.Equals(normalizedSource, normalizedDestination, StringComparison.OrdinalIgnoreCase))
        {
            File.Copy(sourcePath, destination, true);
        }

        project.IconPath = destination;
        return destination;
    }
}
