using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;

namespace Electronifier.Desktop;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var mainWindow = new MainWindow();
            desktop.MainWindow = mainWindow;

            ConfigureNativeMenu(desktop, mainWindow);
        }

        base.OnFrameworkInitializationCompleted();
    }

    private void ConfigureNativeMenu(IClassicDesktopStyleApplicationLifetime desktop, MainWindow mainWindow)
    {
        var aboutItem = new NativeMenuItem("About Electronifier");
        aboutItem.Click += async (_, _) => await mainWindow.ShowAboutDialogAsync();

        var menuBar = new NativeMenu
        {
            new NativeMenuItem
            {
                Header = "About",
                Menu = new NativeMenu
                {
                    aboutItem
                }
            }
        };

        // Attach to the main window (preferred surface for macOS native menu).
        NativeMenu.SetMenu(mainWindow, menuBar);
        // Also attach at the application level in case the platform consults it.
        if (Application.Current is { } app)
        {
            NativeMenu.SetMenu(app, menuBar);
        }
    }
}
