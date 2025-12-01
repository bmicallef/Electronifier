using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Electronifier.Desktop.ViewModels;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;

namespace Electronifier.Desktop;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        DataContext = new MainWindowViewModel();
    }

    private ProjectDefinitionViewModel? GetActiveProject(Control? sourceControl = null)
    {
        if (sourceControl?.DataContext is ProjectDefinitionViewModel vmFromSender)
        {
            return vmFromSender;
        }

        if (DataContext is not MainWindowViewModel viewModel)
        {
            return null;
        }

        return viewModel.IsNewProjectStage ? viewModel.NewProjectDraft : viewModel.SelectedProject;
    }

    private async Task<string?> BrowseFolderAsync(string title)
    {
        var dialog = new OpenFolderDialog
        {
            Title = title
        };

        var path = await dialog.ShowAsync(this);
        return path;
    }

    private async void OnBrowseMacBinPath(object? sender, RoutedEventArgs e)
    {
        var project = GetActiveProject(sender as Control);
        if (project is null)
        {
            return;
        }

        var path = await BrowseFolderAsync("Select macOS bin folder");
        if (path is not null)
        {
            project.MacBinPath = path;
        }
    }

    private async void OnBrowseMacBinPathX86(object? sender, RoutedEventArgs e)
    {
        var project = GetActiveProject(sender as Control);
        if (project is null)
        {
            return;
        }

        var path = await BrowseFolderAsync("Select macOS bin folder (Intel)");
        if (path is not null)
        {
            project.MacBinPathX86 = path;
        }
    }

    private async void OnBrowseWindowsBinPath(object? sender, RoutedEventArgs e)
    {
        var project = GetActiveProject(sender as Control);
        if (project is null)
        {
            return;
        }

        var path = await BrowseFolderAsync("Select Windows bin folder");
        if (path is not null)
        {
            project.WindowsBinPath = path;
        }
    }

    private async void OnBrowseWindowsBinPathX86(object? sender, RoutedEventArgs e)
    {
        var project = GetActiveProject(sender as Control);
        if (project is null)
        {
            return;
        }

        var path = await BrowseFolderAsync("Select Windows bin folder (x86)");
        if (path is not null)
        {
            project.WindowsBinPathX86 = path;
        }
    }

    private async void OnBrowseLinuxBinPath(object? sender, RoutedEventArgs e)
    {
        var project = GetActiveProject(sender as Control);
        if (project is null)
        {
            return;
        }

        var path = await BrowseFolderAsync("Select Linux bin folder");
        if (path is not null)
        {
            project.LinuxBinPath = path;
        }
    }


    private async void OnBrowseIconFile(object? sender, RoutedEventArgs e)
    {
        var project = GetActiveProject();
        if (project is null)
        {
            return;
        }

        var dialog = new OpenFileDialog
        {
            Title = "Select icon file",
            AllowMultiple = false,
            Filters = new List<FileDialogFilter>
            {
                new()
                {
                    Name = "Icon",
                    Extensions = { "png", "svg" }
                }
            }
        };

        var result = await dialog.ShowAsync(this);
        if (result is { Length: > 0 })
        {
            if (DataContext is MainWindowViewModel viewModel)
            {
                viewModel.StoreProjectIcon(project, result[0]);
            }
            else
            {
                project.IconPath = result[0];
            }
        }
    }

    private async void OnBrowseExecutionScript(object? sender, RoutedEventArgs e)
    {
        var project = GetActiveProject();
        if (project is null)
        {
            return;
        }

        var dialog = new OpenFileDialog
        {
            Title = "Select execution script",
            AllowMultiple = false
        };

        var result = await dialog.ShowAsync(this);
        if (result is { Length: > 0 })
        {
            var scriptName = System.IO.Path.GetFileName(result[0]);
            if (!string.IsNullOrWhiteSpace(scriptName))
            {
                project.ExecutionScript = scriptName;
            }
        }
    }

    private async void OnBrowsePublicationFolder(object? sender, RoutedEventArgs e)
    {
        if (sender is not Button button)
        {
            return;
        }

        if (button.DataContext is not PublicationDestinationViewModel destination)
        {
            return;
        }

        var dialog = new OpenFolderDialog
        {
            Title = "Select publication target folder"
        };

        var path = await dialog.ShowAsync(this);
        if (path is not null)
        {
            destination.LocalDirectoryPath = path;
        }
    }

    private async void OnDeleteProject(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not MainWindowViewModel viewModel)
        {
            return;
        }

        if (viewModel.NewProjectDraft is null)
        {
            return;
        }

        var projectName = viewModel.NewProjectDraft.Name;
        if (string.IsNullOrWhiteSpace(projectName))
        {
            projectName = "this project";
        }

        var dialog = new Window
        {
            Title = "Confirm Delete",
            Width = 400,
            Height = 180,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            CanResize = false
        };

        var panel = new StackPanel
        {
            Margin = new Thickness(20),
            Spacing = 16
        };

        panel.Children.Add(new TextBlock
        {
            Text = $"Are you sure you want to delete \"{projectName}\"?",
            FontSize = 14,
            TextWrapping = Avalonia.Media.TextWrapping.Wrap
        });

        panel.Children.Add(new TextBlock
        {
            Text = "This action cannot be undone.",
            FontSize = 12,
            Foreground = Avalonia.Media.Brushes.OrangeRed
        });

        var buttonPanel = new StackPanel
        {
            Orientation = Avalonia.Layout.Orientation.Horizontal,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
            Spacing = 12
        };

        var deleteButton = new Button
        {
            Content = "DELETE",
            Classes = { "cancel-action" }
        };
        deleteButton.Click += (_, _) =>
        {
            dialog.Close(true);
        };

        var cancelButton = new Button
        {
            Content = "CANCEL"
        };
        cancelButton.Click += (_, _) =>
        {
            dialog.Close(false);
        };

        buttonPanel.Children.Add(deleteButton);
        buttonPanel.Children.Add(cancelButton);
        panel.Children.Add(buttonPanel);

        dialog.Content = panel;

        var result = await dialog.ShowDialog<bool>(this);
        if (result)
        {
            await viewModel.DeleteProjectAsync();
        }
    }

    public Task ShowAboutDialogAsync()
    {
        var aboutWindow = new AboutWindow
        {
            Icon = Icon
        };

        return aboutWindow.ShowDialog(this);
    }

    private async void OnShowAboutWindow(object? sender, RoutedEventArgs e)
    {
        await ShowAboutDialogAsync();
    }

    private async void OnShowCompileGuidance(object? sender, RoutedEventArgs e)
    {
        var guidanceWindow = new CompileGuidanceWindow
        {
            Icon = Icon,
            DataContext = new CompileGuidanceViewModel()
        };

        await guidanceWindow.ShowDialog(this);
    }
}
