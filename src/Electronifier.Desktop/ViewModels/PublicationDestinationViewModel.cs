using System;
using System.Collections.Generic;
using System.Linq;
using Electronifier.Core.Models;

namespace Electronifier.Desktop.ViewModels;

public sealed class PublicationDestinationViewModel : ViewModelBase
{
    private readonly PublicationDestination _model;
    private PublicationDestinationType? _type;

    public PublicationDestinationViewModel(PublicationDestination model)
    {
        _model = model;
        _type = model.Type;
    }

    public PublicationDestination Model => _model;

    public PublicationDestinationType? Type
    {
        get => _type;
        set
        {
            if (SetProperty(ref _type, value))
            {
                _model.Type = value;
                OnPropertyChanged(nameof(IsLocalDirectory));
                OnPropertyChanged(nameof(IsGitHubRelease));
            }
        }
    }

    public string GitHubRepositoryUrl
    {
        get => _model.GitHubRepositoryUrl;
        set
        {
            if (value == _model.GitHubRepositoryUrl)
            {
                return;
            }

            _model.GitHubRepositoryUrl = value;
            OnPropertyChanged();
        }
    }

    public string LocalDirectoryPath
    {
        get => _model.LocalDirectoryPath;
        set
        {
            if (value == _model.LocalDirectoryPath)
            {
                return;
            }

            _model.LocalDirectoryPath = value;
            OnPropertyChanged();
        }
    }

    public string GitHubAccessToken
    {
        get => _model.GitHubAccessToken;
        set
        {
            if (value == _model.GitHubAccessToken)
            {
                return;
            }

            _model.GitHubAccessToken = value;
            OnPropertyChanged();
        }
    }

    public IReadOnlyCollection<PublicationDestinationType?> SupportedTypes { get; } = new PublicationDestinationType?[]
    {
        null,
        PublicationDestinationType.LocalDirectory,
        PublicationDestinationType.GitHubRelease
    };

    public bool IsLocalDirectory => Type == PublicationDestinationType.LocalDirectory;
    public bool IsGitHubRelease => Type == PublicationDestinationType.GitHubRelease;
}
