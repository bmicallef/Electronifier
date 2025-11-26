using System.Text.Json.Serialization;
using Electronifier.Core.Storage;

namespace Electronifier.Core.Models;

public enum PublicationDestinationType
{
    LocalDirectory,
    GitHubRelease
}

public class PublicationDestination
{
    public PublicationDestinationType? Type { get; set; }
    public string GitHubRepositoryUrl { get; set; } = string.Empty;
    public string LocalDirectoryPath { get; set; } = string.Empty;
    public string GitHubAccessTokenEncrypted { get; set; } = string.Empty;

    [JsonIgnore]
    public string GitHubAccessToken
    {
        get => EncryptionHelper.Decrypt(GitHubAccessTokenEncrypted);
        set => GitHubAccessTokenEncrypted = EncryptionHelper.Encrypt(value ?? string.Empty);
    }
}
