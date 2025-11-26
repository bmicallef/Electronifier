namespace Electronifier.Core.Models;

    public class LaunchOptions
    {
        public int Width { get; set; } = 1020;
        public int Height { get; set; } = 768;
        public double? WidthPercentage { get; set; }
        public double? HeightPercentage { get; set; }
        public LaunchPosition Position { get; set; } = LaunchPosition.Centered;
        public bool CreateDesktopShortcut { get; set; } = true;
        public bool AddToDock { get; set; } = false;
        public bool EnableDeveloperTools { get; set; }
        public string EntryUrl { get; set; } = string.Empty;
    }

public enum LaunchPosition
{
    Centered,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    Manual
}
