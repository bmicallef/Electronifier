using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using Avalonia;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Electronifier.Core.Models;

namespace Electronifier.Desktop.ViewModels;

public sealed class ProjectDefinitionViewModel : ViewModelBase
{
    private readonly ProjectDefinition _model;
    private PublicationDestinationViewModel? _selectedPublicationTarget;
    private bool _isReleaseTarget;
    private static readonly Uri DefaultIconUri = new("avares://Electronifier.Desktop/assets/electronifier_logo.png");
    private Bitmap? _iconImage;

    public ProjectDefinitionViewModel(ProjectDefinition model)
    {
        _model = model;
        PublicationTargets = new ObservableCollection<PublicationDestinationViewModel>(
            model.PublicationSettings.PublicationTargets.Select(destination => new PublicationDestinationViewModel(destination)));

        SelectedPublicationTarget = PublicationTargets.FirstOrDefault();
        LaunchOptions = new LaunchOptionsViewModel(model.PublicationSettings.LaunchConfiguration);
        RefreshIconImage();
    }

    public ProjectDefinition Model => _model;
    public string Id => _model.Id;

    public string Name
    {
        get => _model.Name;
        set
        {
            if (value == _model.Name)
            {
                return;
            }

            _model.Name = value;
            OnPropertyChanged();
        }
    }

    public string Version
    {
        get => _model.Version;
        set
        {
            if (value == _model.Version)
            {
                return;
            }

            _model.Version = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(LatestReleaseSummary));
        }
    }

    public string Description
    {
        get => _model.Description;
        set
        {
            if (value == _model.Description)
            {
                return;
            }

            _model.Description = value;
            OnPropertyChanged();
        }
    }

    public string Namespace
    {
        get => _model.Namespace;
        set
        {
            if (value == _model.Namespace)
            {
                return;
            }

            _model.Namespace = value;
            OnPropertyChanged();
        }
    }

    public string Organization
    {
        get => _model.Organization;
        set
        {
            if (value == _model.Organization)
            {
                return;
            }

            _model.Organization = value;
            OnPropertyChanged();
        }
    }

    public string Author
    {
        get => _model.Author;
        set
        {
            if (value == _model.Author)
            {
                return;
            }

            _model.Author = value;
            OnPropertyChanged();
        }
    }

    public string SupportUrl
    {
        get => _model.SupportUrl;
        set
        {
            if (value == _model.SupportUrl)
            {
                return;
            }

            _model.SupportUrl = value;
            OnPropertyChanged();
        }
    }

    public string SupportEmail
    {
        get => _model.SupportEmail;
        set
        {
            if (value == _model.SupportEmail)
            {
                return;
            }

            _model.SupportEmail = value;
            OnPropertyChanged();
        }
    }

    public string IconPath
    {
        get => _model.IconPath;
        set
        {
            if (value == _model.IconPath)
            {
                return;
            }

            _model.IconPath = value;
            OnPropertyChanged();
            RefreshIconImage();
        }
    }

    public Bitmap IconImage
    {
        get
        {
            if (_iconImage is not null)
            {
                return _iconImage;
            }

            RefreshIconImage();
            return _iconImage!;
        }
    }

    private void RefreshIconImage()
    {
        _iconImage?.Dispose();

        if (!string.IsNullOrWhiteSpace(IconPath) && File.Exists(IconPath))
        {
            _iconImage = new Bitmap(IconPath);
        }
        else
        {
            using var stream = AssetLoader.Open(DefaultIconUri);
            _iconImage = new Bitmap(stream);
        }

        OnPropertyChanged(nameof(IconImage));
    }

    public string ExecutionScript
    {
        get => _model.PublicationSettings.ExecutionScript;
        set
        {
            if (value == _model.PublicationSettings.ExecutionScript)
            {
                return;
            }

            _model.PublicationSettings.ExecutionScript = value;
            OnPropertyChanged();
        }
    }

    public string BinPath
    {
        get => _model.BinPath;
        set
        {
            if (value == _model.BinPath)
            {
                return;
            }

            _model.BinPath = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(MacBinPath));
            OnPropertyChanged(nameof(MacBinPathX86));
            OnPropertyChanged(nameof(WindowsBinPath));
            OnPropertyChanged(nameof(WindowsBinPathX86));
            OnPropertyChanged(nameof(LinuxBinPath));
            OnPropertyChanged(nameof(HasMacBinPath));
            OnPropertyChanged(nameof(HasMacBinPathX86));
            OnPropertyChanged(nameof(HasAnyMacBinPath));
            OnPropertyChanged(nameof(HasWindowsBinPath));
            OnPropertyChanged(nameof(HasWindowsBinPathX86));
            OnPropertyChanged(nameof(HasAnyWindowsBinPath));
            OnPropertyChanged(nameof(HasLinuxBinPath));
        }
    }

    public string MacBinPath
    {
        get => _model.MacBinPath;
        set
        {
            if (value == _model.MacBinPath)
            {
                return;
            }

            _model.MacBinPath = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasMacBinPath));
            OnPropertyChanged(nameof(HasMacBinPathX86));
        }
    }

    public string MacBinPathX86
    {
        get => _model.MacBinPathX86;
        set
        {
            if (value == _model.MacBinPathX86)
            {
                return;
            }

            _model.MacBinPathX86 = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasMacBinPath));
            OnPropertyChanged(nameof(HasMacBinPathX86));
        }
    }

    public string WindowsBinPath
    {
        get => _model.WindowsBinPath;
        set
        {
            if (value == _model.WindowsBinPath)
            {
                return;
            }

            _model.WindowsBinPath = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasWindowsBinPath));
            OnPropertyChanged(nameof(HasWindowsBinPathX86));
            OnPropertyChanged(nameof(HasAnyWindowsBinPath));
        }
    }

    public string WindowsBinPathX86
    {
        get => _model.WindowsBinPathX86;
        set
        {
            if (value == _model.WindowsBinPathX86)
            {
                return;
            }

            _model.WindowsBinPathX86 = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasWindowsBinPath));
            OnPropertyChanged(nameof(HasWindowsBinPathX86));
            OnPropertyChanged(nameof(HasAnyWindowsBinPath));
        }
    }

    public string LinuxBinPath
    {
        get => _model.LinuxBinPath;
        set
        {
            if (value == _model.LinuxBinPath)
            {
                return;
            }

            _model.LinuxBinPath = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasLinuxBinPath));
        }
    }

    public bool HasMacBinPath => !string.IsNullOrWhiteSpace(MacBinPath);
    public bool HasMacBinPathX86 => !string.IsNullOrWhiteSpace(MacBinPathX86);
    public bool HasAnyMacBinPath => HasMacBinPath || HasMacBinPathX86;
    public bool HasWindowsBinPath => !string.IsNullOrWhiteSpace(WindowsBinPath);
    public bool HasWindowsBinPathX86 => !string.IsNullOrWhiteSpace(WindowsBinPathX86);
    public bool HasAnyWindowsBinPath => HasWindowsBinPath || HasWindowsBinPathX86;
    public bool HasLinuxBinPath => !string.IsNullOrWhiteSpace(LinuxBinPath);

    public ObservableCollection<PublicationDestinationViewModel> PublicationTargets { get; }
    public LaunchOptionsViewModel LaunchOptions { get; }

    public int ReleaseCount => _model.Releases.Count;
    public void NotifyReleaseCountChanged() => OnPropertyChanged(nameof(ReleaseCount));
    public void NotifyReleaseMetadataChanged()
    {
        OnPropertyChanged(nameof(LatestReleaseSummary));
    }

    public bool IsReleaseTarget
    {
        get => _isReleaseTarget;
        set => SetProperty(ref _isReleaseTarget, value);
    }

    public string LatestReleaseSummary
    {
        get
        {
            var latestRelease = _model.Releases
                .OrderByDescending(release => release.PublishedAt ?? DateTimeOffset.MinValue)
                .FirstOrDefault();

            var version = !string.IsNullOrWhiteSpace(latestRelease?.Version)
                ? latestRelease!.Version
                : Version;

            var publishedAt = latestRelease?.PublishedAt;
            var publishedText = publishedAt?.ToString("yyyy-MM-dd") ?? "N/A";

            return $"v {version} - last published on {publishedText}";
        }
    }

    public PublicationDestinationViewModel? SelectedPublicationTarget
    {
        get => _selectedPublicationTarget;
        set => SetProperty(ref _selectedPublicationTarget, value);
    }

    public void RemovePublicationTarget(PublicationDestinationViewModel? target)
    {
        if (target is null)
        {
            return;
        }

        PublicationTargets.Remove(target);
        _model.PublicationSettings.PublicationTargets.Remove(target.Model);
        if (SelectedPublicationTarget == target)
        {
            SelectedPublicationTarget = PublicationTargets.FirstOrDefault();
        }
    }

    public void AddPublicationTarget()
    {
        var destination = new PublicationDestination();
        _model.PublicationSettings.PublicationTargets.Add(destination);
        var viewModel = new PublicationDestinationViewModel(destination);
        PublicationTargets.Add(viewModel);
        SelectedPublicationTarget = viewModel;
    }
}
