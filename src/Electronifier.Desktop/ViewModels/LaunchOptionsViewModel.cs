using System;
using System.Collections.Generic;
using System.Linq;
using Electronifier.Core.Models;

namespace Electronifier.Desktop.ViewModels;

public enum LaunchSizingMode
{
    Pixels,
    Percentages
}

public sealed class ResolutionPreset
{
    public string Label { get; }
    public int? Width { get; }
    public int? Height { get; }
    public double? WidthPercent { get; }
    public double? HeightPercent { get; }

    public ResolutionPreset(string label, int? width = null, int? height = null, double? widthPercent = null, double? heightPercent = null)
    {
        Label = label;
        Width = width;
        Height = height;
        WidthPercent = widthPercent;
        HeightPercent = heightPercent;
    }

    public override string ToString() => Label;
}

public sealed class LaunchOptionsViewModel : ViewModelBase
{
    private readonly LaunchOptions _options;
    private LaunchSizingMode _mode = LaunchSizingMode.Pixels;
    private ResolutionPreset? _selectedPixelPreset;
    private ResolutionPreset? _selectedPercentPreset;

    public LaunchOptionsViewModel(LaunchOptions options)
    {
        _options = options;
        _mode = LaunchSizingMode.Pixels;
        _selectedPixelPreset = PixelPresets.FirstOrDefault();
        _selectedPercentPreset = PercentPresets.FirstOrDefault();
    }

    public LaunchOptions Model => _options;

    public int Width
    {
        get => _options.Width;
        set
        {
            if (value == _options.Width)
            {
                return;
            }

            _options.Width = value;
            OnPropertyChanged();
        }
    }

    public int Height
    {
        get => _options.Height;
        set
        {
            if (value == _options.Height)
            {
                return;
            }

            _options.Height = value;
            OnPropertyChanged();
        }
    }

    public double? WidthPercentage
    {
        get => _options.WidthPercentage;
        set
        {
            if (value == _options.WidthPercentage)
            {
                return;
            }

            _options.WidthPercentage = value;
            OnPropertyChanged();
        }
    }

    public double? HeightPercentage
    {
        get => _options.HeightPercentage;
        set
        {
            if (value == _options.HeightPercentage)
            {
                return;
            }

            _options.HeightPercentage = value;
            OnPropertyChanged();
        }
    }

    public LaunchSizingMode Mode
    {
        get => _mode;
        set
        {
            if (value == _mode)
            {
                return;
            }

            _mode = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsPixelMode));
            OnPropertyChanged(nameof(IsPercentMode));
        }
    }

    public IReadOnlyList<LaunchSizingMode> AvailableSizingModes { get; } = Enum.GetValues<LaunchSizingMode>().ToList();

    public bool IsPixelMode => Mode == LaunchSizingMode.Pixels;
    public bool IsPercentMode => Mode == LaunchSizingMode.Percentages;

    public IReadOnlyList<ResolutionPreset> PixelPresets { get; } = new List<ResolutionPreset>
    {
        new("1020 x 768", 1020, 768),
        new("1280 x 720", 1280, 720),
        new("1366 x 768", 1366, 768),
        new("1600 x 900", 1600, 900)
    };

    public IReadOnlyList<ResolutionPreset> PercentPresets { get; } = new List<ResolutionPreset>
    {
        new("100% x 100%", widthPercent: 1.0, heightPercent: 1.0),
        new("80% x 80%", widthPercent: 0.8, heightPercent: 0.8),
        new("75% x 50%", widthPercent: 0.75, heightPercent: 0.5),
        new("50% x 50%", widthPercent: 0.5, heightPercent: 0.5)
    };

    public ResolutionPreset? SelectedPixelPreset
    {
        get => _selectedPixelPreset;
        set
        {
            if (SetProperty(ref _selectedPixelPreset, value) && value is not null)
            {
                Mode = LaunchSizingMode.Pixels;
                Width = value.Width ?? Width;
                Height = value.Height ?? Height;
            }
        }
    }

    public ResolutionPreset? SelectedPercentPreset
    {
        get => _selectedPercentPreset;
        set
        {
            if (SetProperty(ref _selectedPercentPreset, value) && value is not null)
            {
                Mode = LaunchSizingMode.Percentages;
                WidthPercentage = value.WidthPercent ?? WidthPercentage;
                HeightPercentage = value.HeightPercent ?? HeightPercentage;
            }
        }
    }

    public IReadOnlyList<LaunchPosition> AvailablePositions { get; } = Enum.GetValues<LaunchPosition>().ToList();

    public LaunchPosition Position
    {
        get => _options.Position;
        set
        {
            if (value == _options.Position)
            {
                return;
            }

            _options.Position = value;
            OnPropertyChanged();
        }
    }

    public bool CreateDesktopShortcut
    {
        get => _options.CreateDesktopShortcut;
        set
        {
            if (value == _options.CreateDesktopShortcut)
            {
                return;
            }

            _options.CreateDesktopShortcut = value;
            OnPropertyChanged();
        }
    }

    public bool AddToDock
    {
        get => _options.AddToDock;
        set
        {
            if (value == _options.AddToDock)
            {
                return;
            }

            _options.AddToDock = value;
            OnPropertyChanged();
        }
    }

    public bool EnableDeveloperTools
    {
        get => _options.EnableDeveloperTools;
        set
        {
            if (value == _options.EnableDeveloperTools)
            {
                return;
            }

            _options.EnableDeveloperTools = value;
            OnPropertyChanged();
        }
    }

    public string EntryUrl
    {
        get => _options.EntryUrl;
        set
        {
            if (value == _options.EntryUrl)
            {
                return;
            }

            _options.EntryUrl = value;
            OnPropertyChanged();
        }
    }
}
