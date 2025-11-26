using Avalonia.Controls;
using Avalonia.Interactivity;
using Electronifier.Desktop.ViewModels;

namespace Electronifier.Desktop;

public partial class CompileGuidanceWindow : Window
{
    public CompileGuidanceWindow()
    {
        InitializeComponent();
    }

    private void OnCloseGuidanceWindow(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    private async void OnCopySnippet(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not CompileGuidanceViewModel viewModel)
        {
            return;
        }

        var snippet = viewModel.SelectedSnippet;
        if (string.IsNullOrWhiteSpace(snippet))
        {
            viewModel.CopyStatusMessage = "Snippet is empty.";
            return;
        }

        if (Clipboard is null)
        {
            viewModel.CopyStatusMessage = "Clipboard is unavailable.";
            return;
        }

        await Clipboard.SetTextAsync(snippet);
        viewModel.CopyStatusMessage = "Snippet copied to clipboard.";
    }
}
