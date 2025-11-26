using System;
using System.Diagnostics;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;

namespace Electronifier.Desktop;

public partial class AboutWindow : Window
{
    public AboutWindow()
    {
        InitializeComponent();
        DataContext = this;
    }

    public string VersionLabel { get; } = $"v{GetVersionString()}";

    private static string GetVersionString()
    {
        var version = typeof(App).Assembly.GetName().Version ?? new Version(1, 0, 0);
        var build = version.Build >= 0 ? version.Build : 0;
        return $"{version.Major}.{version.Minor}.{build}";
    }

    private void OnEmailSupport(object? sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo("mailto:support@knowledgelocker.com")
            {
                UseShellExecute = true
            });
        }
        catch
        {
            // Best effort only; swallow failures to keep the user in the app.
        }
    }
}
