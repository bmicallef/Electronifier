using System;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Electronifier.Core.Storage;

public sealed class AppStateRepository
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true
    };

    private readonly string _statePath;
    private readonly string _configurationDirectory;

    public AppStateRepository(string? baseDirectory = null)
    {
        _configurationDirectory = GetConfigurationDirectory(baseDirectory);
        _statePath = Path.Combine(_configurationDirectory, "app.json");
    }

    public string ConfigurationDirectory => _configurationDirectory;

    public async Task<AppState> LoadAsync(CancellationToken cancellationToken = default)
    {
        EnsureDirectoryExists();
        if (!File.Exists(_statePath))
        {
            return new AppState();
        }

        var payload = await File.ReadAllTextAsync(_statePath, cancellationToken).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return new AppState();
        }

        return JsonSerializer.Deserialize<AppState>(payload, SerializerOptions) ?? new AppState();
    }

    public async Task SaveAsync(AppState state, CancellationToken cancellationToken = default)
    {
        EnsureDirectoryExists();
        var payload = JsonSerializer.Serialize(state, SerializerOptions);
        await File.WriteAllTextAsync(_statePath, payload, cancellationToken).ConfigureAwait(false);
    }

    private void EnsureDirectoryExists()
    {
        var directory = Path.GetDirectoryName(_statePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }

    private static string GetConfigurationDirectory(string? baseDirectory)
    {
        if (string.IsNullOrWhiteSpace(baseDirectory))
        {
            baseDirectory = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        }

        if (string.IsNullOrWhiteSpace(baseDirectory))
        {
            baseDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) ?? ".", ".config");
        }

        return Path.Combine(baseDirectory, "Electronifier");
    }
}
