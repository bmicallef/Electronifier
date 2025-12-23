using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Formats.Tar;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Electronifier.Core.Models;

namespace Electronifier.Core.Services;

public sealed record ReleaseArtifact(PlatformTarget Platform, string PackagePath, string? PackagingNote = null);

public sealed record ReleasePublicationOutcome(PublicationDestinationType Type, string TargetIdentifier, bool Success, string Detail);

public sealed record ReleaseAutomationProgress(string Message, double Percentage);

internal sealed record BuildTarget(PlatformTarget Platform, Architecture Architecture, string SourcePath, string ArchitectureLabel);

public sealed class ReleaseAutomationResult
{
    public bool Success { get; }
    public string Message { get; }
    public IReadOnlyList<ReleaseArtifact> Artifacts { get; }
    public IReadOnlyList<ReleasePublicationOutcome> Publications { get; }

    public ReleaseAutomationResult(bool success, string message, IReadOnlyList<ReleaseArtifact> artifacts, IReadOnlyList<ReleasePublicationOutcome> publications)
    {
        Success = success;
        Message = message;
        Artifacts = artifacts;
        Publications = publications;
    }
}

public sealed record ProcessRunResult(bool Success, string Output);

public sealed class ReleaseAutomationService
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() }
    };

    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMinutes(30)
    };
    private readonly string _templateRoot = LocateTemplateRoot();

    public async Task<ReleaseAutomationResult> PublishAsync(ProjectDefinition project, ProjectRelease release, LaunchOptions launchOptions, IProgress<ReleaseAutomationProgress>? progress = null, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(project);
        ArgumentNullException.ThrowIfNull(release);
        ArgumentNullException.ThrowIfNull(launchOptions);

        if (string.IsNullOrWhiteSpace(release.Version))
        {
            throw new InvalidOperationException("Release version cannot be empty.");
        }

        var destination = release.PublicationDestination ?? throw new InvalidOperationException("Publication destination is required.");
        if (destination.Type is null)
        {
            throw new InvalidOperationException("Publication destination type is not set.");
        }

        var platforms = release.Platforms?.Any() == true
            ? release.Platforms
            : project.PublicationSettings.DefaultPlatformTargets;

        if (platforms is null || !platforms.Any())
        {
            throw new InvalidOperationException("No platforms were selected for the release.");
        }

        ReportStage(progress, "Preparing Photino wrapper template...", 0.05);

        var targets = BuildTargets(project, release, platforms);
        var artifacts = new List<ReleaseArtifact>();
        var perTargetIncrement = 0.55 / Math.Max(1, targets.Count);

        foreach (var target in targets)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var percentBase = 0.1 + artifacts.Count * perTargetIncrement;
            ReportStage(progress, $"Building Photino wrapper for {target.Platform} ({target.ArchitectureLabel})...", percentBase);

            if (string.IsNullOrWhiteSpace(target.SourcePath) || (!Directory.Exists(target.SourcePath) && !File.Exists(target.SourcePath)))
            {
                ReportStage(progress, $"Skipping {target.Platform} ({target.ArchitectureLabel}): no bin folder selected.", percentBase);
                continue;
            }

            var artifact = await BuildPhotinoWrapperAsync(project, release, launchOptions, target, progress, cancellationToken).ConfigureAwait(false);
            artifacts.Add(artifact);

            ReportStage(progress, $"Packaged {target.Platform} ({target.ArchitectureLabel}) artifact.", percentBase + perTargetIncrement * 0.75);
        }

        ReportStage(progress, "Publishing artifacts...", 0.82);

        var publications = new List<ReleasePublicationOutcome>
        {
            await PublishToDestinationAsync(destination, project, release, artifacts, cancellationToken).ConfigureAwait(false)
        };
        release.PublishedAt = DateTimeOffset.UtcNow;

        var publicationMessage = string.Join(" | ", publications.Select(p =>
            p.Success
                ? $"{p.TargetIdentifier}: published"
                : $"{p.TargetIdentifier}: failed - {p.Detail}"));
        var artifactDescriptions = artifacts.Select(a =>
        {
            var note = string.IsNullOrWhiteSpace(a.PackagingNote) ? string.Empty : $" - {a.PackagingNote}";
            return $"{a.Platform} ({Path.GetFileName(a.PackagePath)}{note})";
        });
        var summary = $"Built {artifacts.Count} Photino artifact(s): {string.Join(", ", artifactDescriptions)}. {publicationMessage}";
        var overallSuccess = artifacts.Any() && publications.All(p => p.Success);

        ReportStage(progress, overallSuccess ? "Release completed successfully." : "Release completed with issues.", overallSuccess ? 1 : 0.9);

        return new ReleaseAutomationResult(overallSuccess, summary, artifacts, publications);
    }

    private async Task<ReleaseArtifact> BuildPhotinoWrapperAsync(ProjectDefinition project, ProjectRelease release, LaunchOptions launchOptions, BuildTarget target, IProgress<ReleaseAutomationProgress>? progress, CancellationToken cancellationToken)
    {
        var safeProjectName = SanitizeForFileSystem(project.Name);
        var safeVersion = SanitizeForFileSystem(release.Version);
        var platformSegment = target.Platform.ToString().ToLowerInvariant();
        var archSegment = target.ArchitectureLabel.ToLowerInvariant();
        var tempRoot = Path.Combine(Path.GetTempPath(), "Electronifier", safeProjectName, safeVersion, platformSegment, archSegment);

        if (Directory.Exists(tempRoot))
        {
            Directory.Delete(tempRoot, true);
        }

        Directory.CreateDirectory(tempRoot);

        CopyTemplate(tempRoot);
        var iconPath = CopyIcon(project.IconPath, tempRoot);

        WriteLaunchSettings(launchOptions, iconPath, tempRoot, project.PublicationSettings.ExecutionScript);
        CopyRuntime(target.SourcePath, Path.Combine(tempRoot, "runtime"));
        ApplyTemplateTokens(tempRoot, project.Name, project.Description);

        var rid = ResolveRuntimeIdentifier(target.Platform, target.Architecture);
        var publishDir = Path.Combine(tempRoot, "publish");

        var publishArgs = new[]
        {
            "publish",
            "PhotinoWrapper.csproj",
            "-c",
            "Release",
            "-r",
            rid,
            "--self-contained",
            "true",
            "--output",
            publishDir,
            "/p:PublishSingleFile=false",
            "/p:PublishTrimmed=false",
            "/p:IncludeNativeLibrariesForSelfExtract=false"
        };

        var publishResult = await RunProcessAsync("dotnet", publishArgs, tempRoot, cancellationToken, line =>
        {
            ReportStage(progress, $"[dotnet publish:{target.Platform}-{target.ArchitectureLabel}] {line}", 0.55);
        }).ConfigureAwait(false);

        if (!publishResult.Success)
        {
            var detail = SummarizeProcessOutput(publishResult.Output);
            throw new InvalidOperationException($"dotnet publish failed for {target.Platform} ({target.ArchitectureLabel}): {detail}");
        }

        if (target.Platform == PlatformTarget.macOS)
        {
            var macArtifact = await CreateMacArtifactsAsync(project, release, safeProjectName, safeVersion, archSegment, publishDir, tempRoot, progress, cancellationToken).ConfigureAwait(false);
            return new ReleaseArtifact(target.Platform, macArtifact);
        }

        if (target.Platform == PlatformTarget.Linux)
        {
            var debPath = await CreateDebPackageAsync(project, release, safeProjectName, safeVersion, archSegment, publishDir, tempRoot, cancellationToken).ConfigureAwait(false);
            return new ReleaseArtifact(target.Platform, debPath);
        }

        // Windows: attempt MSI when toolchain available; fall back to ZIP with a note.
        var (windowsArtifact, packagingNote) = await CreateWindowsPackageAsync(project, release, safeProjectName, safeVersion, archSegment, publishDir, tempRoot, cancellationToken).ConfigureAwait(false);
        return new ReleaseArtifact(target.Platform, windowsArtifact, packagingNote);
    }

    private async Task<ReleasePublicationOutcome> PublishToDestinationAsync(PublicationDestination destination, ProjectDefinition project, ProjectRelease release, IReadOnlyList<ReleaseArtifact> artifacts, CancellationToken cancellationToken)
    {
        var destinationType = destination.Type ?? PublicationDestinationType.LocalDirectory;
        try
        {
            switch (destinationType)
            {
                case PublicationDestinationType.LocalDirectory:
                    return PublishToLocalDirectory(destination, artifacts);
                case PublicationDestinationType.GitHubRelease:
                    return await PublishToGitHubAsync(destination, project, release, artifacts, cancellationToken).ConfigureAwait(false);
                default:
                    return new ReleasePublicationOutcome(destinationType, destinationType.ToString(), false, "Unsupported publication type.");
            }
        }
        catch (Exception ex)
        {
            return new ReleasePublicationOutcome(destinationType, destinationType.ToString(), false, ex.Message);
        }
    }

    private static ReleasePublicationOutcome PublishToLocalDirectory(PublicationDestination destination, IReadOnlyList<ReleaseArtifact> artifacts)
    {
        var target = destination.LocalDirectoryPath;
        if (string.IsNullOrWhiteSpace(target))
        {
            return new ReleasePublicationOutcome(PublicationDestinationType.LocalDirectory, "<unset>", false, "Local directory is not configured.");
        }

        Directory.CreateDirectory(target);
        foreach (var artifact in artifacts)
        {
            var dest = Path.Combine(target, Path.GetFileName(artifact.PackagePath));
            File.Copy(artifact.PackagePath, dest, true);
        }

        return new ReleasePublicationOutcome(PublicationDestinationType.LocalDirectory, target, true, $"Copied {artifacts.Count} artifact(s).");
    }

    private static async Task<ReleasePublicationOutcome> PublishToGitHubAsync(PublicationDestination destination, ProjectDefinition project, ProjectRelease release, IReadOnlyList<ReleaseArtifact> artifacts, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(destination.GitHubRepositoryUrl))
        {
            return new ReleasePublicationOutcome(PublicationDestinationType.GitHubRelease, "<unset>", false, "GitHub repository URL is missing.");
        }

        if (string.IsNullOrWhiteSpace(destination.GitHubAccessToken))
        {
            return new ReleasePublicationOutcome(PublicationDestinationType.GitHubRelease, destination.GitHubRepositoryUrl, false, "GitHub access token is missing.");
        }

        if (!TryParseGitHubRepository(destination.GitHubRepositoryUrl, out var owner, out var repo))
        {
            return new ReleasePublicationOutcome(PublicationDestinationType.GitHubRelease, destination.GitHubRepositoryUrl, false, "Unable to parse GitHub repository owner and name.");
        }

        Http.DefaultRequestHeaders.UserAgent.Clear();
        Http.DefaultRequestHeaders.UserAgent.ParseAdd("Electronifier/1.0");
        Http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", destination.GitHubAccessToken);

        var tag = release.Version.StartsWith("v", StringComparison.OrdinalIgnoreCase)
            ? release.Version
            : $"v{release.Version}";

        var payload = new
        {
            tag_name = tag,
            name = $"{project.Name} {release.Version}",
            body = string.IsNullOrWhiteSpace(release.ReleaseNotes) ? $"Automatic release for {project.Name}." : release.ReleaseNotes,
            draft = false,
            prerelease = false
        };

        var requestUrl = $"https://api.github.com/repos/{owner}/{repo}/releases";
        var response = await Http.PostAsync(requestUrl, new StringContent(JsonSerializer.Serialize(payload, SerializerOptions), Encoding.UTF8, "application/json"), cancellationToken).ConfigureAwait(false);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            return new ReleasePublicationOutcome(PublicationDestinationType.GitHubRelease, destination.GitHubRepositoryUrl, false, $"GitHub release creation failed: {response.StatusCode} - {responseBody}");
        }

        using var document = JsonDocument.Parse(responseBody);
        var uploadUrlTemplate = document.RootElement.GetProperty("upload_url").GetString() ?? string.Empty;
        var uploadEndpoint = uploadUrlTemplate.Split('{')[0];

        foreach (var artifact in artifacts)
        {
            cancellationToken.ThrowIfCancellationRequested();

            await using var fileStream = File.OpenRead(artifact.PackagePath);
            using var content = new StreamContent(fileStream);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");

            var assetName = Path.GetFileName(artifact.PackagePath);
            var uploadUri = $"{uploadEndpoint}?name={Uri.EscapeDataString(assetName)}";
            var uploadResponse = await Http.PostAsync(uploadUri, content, cancellationToken).ConfigureAwait(false);

            if (!uploadResponse.IsSuccessStatusCode)
            {
                var assetBody = await uploadResponse.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                return new ReleasePublicationOutcome(PublicationDestinationType.GitHubRelease, destination.GitHubRepositoryUrl, false, $"Uploading {assetName} failed: {uploadResponse.StatusCode} - {assetBody}");
            }
        }

        return new ReleasePublicationOutcome(PublicationDestinationType.GitHubRelease, destination.GitHubRepositoryUrl, true, $"Published {artifacts.Count} artifact(s) to GitHub.");
    }

    private static string LocateTemplateRoot()
    {
        var baseDir = AppContext.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(baseDir, "templates", "PhotinoWrapper"),
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "templates", "PhotinoWrapper")),
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "..", "src", "Electronifier.Core", "templates", "PhotinoWrapper")),
            Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "templates", "PhotinoWrapper")),
            Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "src", "Electronifier.Core", "templates", "PhotinoWrapper"))
        };

        var match = candidates.FirstOrDefault(Directory.Exists);
        if (match is not null)
        {
            return match;
        }

        var checkedPaths = string.Join(Environment.NewLine + "  - ", candidates);
        var errorMessage = $"Unable to locate the Photino wrapper template directory. This is required to build releases.{Environment.NewLine}{Environment.NewLine}" +
                          $"Searched the following locations:{Environment.NewLine}  - {checkedPaths}{Environment.NewLine}{Environment.NewLine}" +
                          $"Please ensure the templates/PhotinoWrapper directory exists in your Electronifier installation.";
        
        throw new DirectoryNotFoundException(errorMessage);
    }

    private void CopyTemplate(string destination)
    {
        if (!Directory.Exists(destination))
        {
            Directory.CreateDirectory(destination);
        }

        CopyDirectory(_templateRoot, destination);
    }

    private static void CopyRuntime(string source, string destination)
    {
        if (Directory.Exists(source))
        {
            CopyDirectory(source, destination);
            return;
        }

        Directory.CreateDirectory(destination);
        if (File.Exists(source))
        {
            var destFile = Path.Combine(destination, Path.GetFileName(source)!);
            File.Copy(source, destFile, true);
        }
    }

    private static string CopyIcon(string? iconPath, string destinationRoot)
    {
        var iconsRoot = Path.Combine(destinationRoot, "icons");
        Directory.CreateDirectory(iconsRoot);

        var fileName = "appicon.png";
        if (!string.IsNullOrWhiteSpace(iconPath) && File.Exists(iconPath))
        {
            fileName = "appicon" + Path.GetExtension(iconPath);
            File.Copy(iconPath, Path.Combine(iconsRoot, fileName), true);
        }

        return Path.Combine("icons", fileName);
    }

    private static async Task<string> CreateMacArtifactsAsync(ProjectDefinition project, ProjectRelease release, string safeProjectName, string safeVersion, string archSegment, string publishDir, string tempRoot, IProgress<ReleaseAutomationProgress>? progress, CancellationToken cancellationToken)
    {
        var bundleName = $"{safeProjectName}.app";
        var bundlePath = Path.Combine(tempRoot, bundleName);
        var contentsRoot = Path.Combine(bundlePath, "Contents");
        var macOsRoot = Path.Combine(contentsRoot, "MacOS");
        var resourcesRoot = Path.Combine(contentsRoot, "Resources");

        if (Directory.Exists(bundlePath))
        {
            Directory.Delete(bundlePath, true);
        }

        Directory.CreateDirectory(macOsRoot);
        Directory.CreateDirectory(resourcesRoot);

        CopyDirectory(publishDir, macOsRoot);

        var executable = FindWrapperExecutable(macOsRoot, safeProjectName);
        var launcherName = "launcher";
        var launcherPath = Path.Combine(macOsRoot, launcherName);
        CreateLauncherScript(launcherPath, executable);
        TryMarkExecutable(launcherPath);
        SetExecutablePermissionsViaChmod(launcherPath);
        if (!string.IsNullOrWhiteSpace(executable))
        {
            var execPath = Path.Combine(macOsRoot, executable);
            TryMarkExecutable(execPath);
            SetExecutablePermissionsViaChmod(execPath);
        }

        var iconFile = Directory.EnumerateFiles(Path.Combine(tempRoot, "icons")).FirstOrDefault();
        string? finalIconName = null;
        if (iconFile is not null)
        {
            try
            {
                var icnsPath = await GenerateMacIcons(iconFile, tempRoot, cancellationToken).ConfigureAwait(false);
                var destIcon = Path.Combine(resourcesRoot, Path.GetFileName(icnsPath));
                File.Copy(icnsPath, destIcon, true);
                finalIconName = Path.GetFileName(icnsPath);
            }
            catch (Exception ex)
            {
                // Fallback to simple copy if generation fails
                progress?.Report(new ReleaseAutomationProgress($"Warning: Failed to generate .icns file ({ex.Message}). Falling back to PNG.", 0));
                var destIcon = Path.Combine(resourcesRoot, Path.GetFileName(iconFile));
                File.Copy(iconFile, destIcon, true);
                finalIconName = Path.GetFileName(iconFile);
            }
        }

        WriteMacInfoPlist(contentsRoot, project, release, launcherName, finalIconName);

        // Stage the .app inside a folder so the DMG contains the bundle
        var dmgStaging = Path.Combine(tempRoot, "dmg-staging");
        if (Directory.Exists(dmgStaging))
        {
            Directory.Delete(dmgStaging, true);
        }
        Directory.CreateDirectory(dmgStaging);
        var stagedApp = Path.Combine(dmgStaging, bundleName);
        CopyDirectory(bundlePath, stagedApp);
        var stagedLauncher = Path.Combine(stagedApp, "Contents", "MacOS", launcherName);
        TryMarkExecutable(stagedLauncher);
        SetExecutablePermissionsViaChmod(stagedLauncher);

        // Zip the .app as a fallback in case DMG creation fails
        var bundleZip = Path.Combine(tempRoot, $"{safeProjectName}-macos-{archSegment}-{safeVersion}.zip");
        if (File.Exists(bundleZip))
        {
            File.Delete(bundleZip);
        }
        ZipFile.CreateFromDirectory(bundlePath, bundleZip, CompressionLevel.Optimal, includeBaseDirectory: true);

        var dmgPath = Path.Combine(tempRoot, $"{safeProjectName}-macos-{archSegment}-{safeVersion}.dmg");
        var dmgResult = await RunProcessAsync(
            "hdiutil",
            new[] { "create", "-fs", "HFS+", "-srcfolder", dmgStaging, "-volname", project.Name, "-ov", "-format", "UDZO", dmgPath },
            tempRoot,
            cancellationToken,
            line => progress?.Report(new ReleaseAutomationProgress(line, 0.7))).ConfigureAwait(false);

        if (dmgResult.Success && File.Exists(dmgPath))
        {
            return dmgPath;
        }

        return bundleZip;
    }

    private static async Task<string> GenerateMacIcons(string sourceIconPath, string tempRoot, CancellationToken cancellationToken)
    {
        var iconSetDir = Path.Combine(tempRoot, "icons.iconset");
        if (Directory.Exists(iconSetDir))
        {
            Directory.Delete(iconSetDir, true);
        }
        Directory.CreateDirectory(iconSetDir);

        // Define required sizes for .icns
        var sizes = new[]
        {
            (16, "icon_16x16.png"),
            (32, "icon_16x16@2x.png"),
            (32, "icon_32x32.png"),
            (64, "icon_32x32@2x.png"),
            (128, "icon_128x128.png"),
            (256, "icon_128x128@2x.png"),
            (256, "icon_256x256.png"),
            (512, "icon_256x256@2x.png"),
            (512, "icon_512x512.png"),
            (1024, "icon_512x512@2x.png")
        };

        foreach (var (size, name) in sizes)
        {
            var destPath = Path.Combine(iconSetDir, name);
            var result = await RunProcessAsync("sips", new[] { "-z", size.ToString(), size.ToString(), sourceIconPath, "--out", destPath }, tempRoot, cancellationToken).ConfigureAwait(false);
            if (!result.Success)
            {
                throw new InvalidOperationException($"Failed to resize icon to {size}x{size}: {result.Output}");
            }
        }

        var icnsPath = Path.Combine(tempRoot, "appicon.icns");
        var iconUtilResult = await RunProcessAsync("iconutil", new[] { "-c", "icns", iconSetDir, "-o", icnsPath }, tempRoot, cancellationToken).ConfigureAwait(false);

        if (!iconUtilResult.Success)
        {
             throw new InvalidOperationException($"Failed to create .icns file: {iconUtilResult.Output}");
        }

        return icnsPath;
    }

    private static void TryMarkExecutable(string path)
    {
        try
        {
            var mode = File.GetUnixFileMode(path);
            mode |= UnixFileMode.UserExecute | UnixFileMode.GroupExecute | UnixFileMode.OtherExecute;
            File.SetUnixFileMode(path, mode);
        }
        catch
        {
            // best effort; may not be supported
        }
    }

    private static void SetExecutablePermissionsViaChmod(string path)
    {
        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo("chmod")
                {
                    ArgumentList = { "+x", path },
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            process.WaitForExit();
        }
        catch
        {
            // best effort
        }
    }

    private static string? FindMacExecutable(string macOsRoot)
    {
        var candidates = Directory.EnumerateFiles(macOsRoot)
            .Where(f =>
            {
                var name = Path.GetFileName(f) ?? string.Empty;
                if (name.EndsWith(".dylib", StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                return !name.Contains('.');
            })
            .ToList();

        if (candidates.Any())
        {
            return Path.GetFileName(candidates.First());
        }

        var any = Directory.EnumerateFiles(macOsRoot).FirstOrDefault();
        return any is null ? null : Path.GetFileName(any);
    }

    private static string? FindWrapperExecutable(string macOsRoot, string fallbackName)
    {
        try
        {
            // Prefer the runtimeconfig base name if present
            var runtimeConfig = Directory.EnumerateFiles(macOsRoot, "*.runtimeconfig.json").FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(runtimeConfig))
            {
                var baseName = Path.GetFileNameWithoutExtension(runtimeConfig);
                if (baseName?.EndsWith(".runtimeconfig", StringComparison.OrdinalIgnoreCase) == true)
                {
                    baseName = baseName[..^".runtimeconfig".Length];
                }

                if (!string.IsNullOrWhiteSpace(baseName))
                {
                    var candidate = Path.Combine(macOsRoot, baseName);
                    if (File.Exists(candidate))
                    {
                        return baseName;
                    }
                }
            }

            // Next: any executable without extension
            var native = FindMacExecutable(macOsRoot);
            if (!string.IsNullOrWhiteSpace(native))
            {
                return native;
            }
        }
        catch
        {
            // ignore and fall back
        }

        return fallbackName;
    }

    private static void CreateLauncherScript(string launcherPath, string? executableName)
    {
        var exec = string.IsNullOrWhiteSpace(executableName) ? "./" : $"./{executableName}";
        var script = $"#!/bin/bash\n" +
                     "DIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\n" +
                     "export DOTNET_ROOT=\"$DIR\"\n" +
                     "cd \"$DIR\"\n" +
                     $"exec \"$DIR/{exec}\" \"$@\"\n";

        File.WriteAllText(launcherPath, script);
    }

    private static void WriteMacInfoPlist(string contentsRoot, ProjectDefinition project, ProjectRelease release, string executableName, string? iconFilePath)
    {
        var orgSegment = string.IsNullOrWhiteSpace(project.Organization) ? "electronifier" : project.Organization;
        var bundleIdentifier = string.IsNullOrWhiteSpace(project.Namespace)
            ? $"com.{SanitizeForFileSystem(orgSegment)}.{SanitizeForFileSystem(project.Name)}"
            : project.Namespace;

        var iconName = iconFilePath is null ? null : Path.GetFileName(iconFilePath);

        var plist = $"""
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
              <dict>
                <key>CFBundleName</key>
                <string>{project.Name}</string>
                <key>CFBundleDisplayName</key>
                <string>{project.Name}</string>
                <key>CFBundleIdentifier</key>
                <string>{bundleIdentifier}</string>
                <key>CFBundleVersion</key>
                <string>{release.Version}</string>
                <key>CFBundleShortVersionString</key>
                <string>{release.Version}</string>
                <key>CFBundleExecutable</key>
                <string>{executableName}</string>
                <key>LSMinimumSystemVersion</key>
                <string>11.0</string>
                <key>LSApplicationCategoryType</key>
                <string>public.app-category.developer-tools</string>
                <key>NSHighResolutionCapable</key>
                <true/>
        """;

        if (!string.IsNullOrWhiteSpace(iconName))
        {
            plist += $"""
                <key>CFBundleIconFile</key>
                <string>{iconName}</string>
            """;
        }

        plist += """
                <key>NSAppTransportSecurity</key>
                <dict>
                  <key>NSAllowsArbitraryLoads</key>
                  <true/>
                  <key>NSAllowsLocalNetworking</key>
                  <true/>
                  <key>NSExceptionDomains</key>
                  <dict>
                    <key>localhost</key>
                    <dict>
                      <key>NSExceptionAllowsInsecureHTTPLoads</key>
                      <true/>
                      <key>NSExceptionRequiresForwardSecrecy</key>
                      <false/>
                      <key>NSIncludesSubdomains</key>
                      <true/>
                    </dict>
                    <key>127.0.0.1</key>
                    <dict>
                      <key>NSExceptionAllowsInsecureHTTPLoads</key>
                      <true/>
                      <key>NSExceptionRequiresForwardSecrecy</key>
                      <false/>
                      <key>NSIncludesSubdomains</key>
                      <true/>
                    </dict>
                  </dict>
                </dict>
        """;

        plist += """
              </dict>
            </plist>
        """;

        File.WriteAllText(Path.Combine(contentsRoot, "Info.plist"), plist);
    }

    private static void WriteLaunchSettings(LaunchOptions launchOptions, string iconPath, string appRoot, string? executionScript)
    {
        var payload = new
        {
            width = launchOptions.Width,
            height = launchOptions.Height,
            widthPercentage = launchOptions.WidthPercentage,
            heightPercentage = launchOptions.HeightPercentage,
            position = launchOptions.Position,
            enableDevTools = launchOptions.EnableDeveloperTools,
            executionScript = string.IsNullOrWhiteSpace(executionScript) ? null : executionScript,
            entryUrl = string.IsNullOrWhiteSpace(launchOptions.EntryUrl) ? null : launchOptions.EntryUrl,
            icon = iconPath
        };

        var contents = JsonSerializer.Serialize(payload, SerializerOptions);
        File.WriteAllText(Path.Combine(appRoot, "launch-settings.json"), contents);
    }

    private static void ApplyTemplateTokens(string appRoot, string appName, string description)
    {
        var sanitizedAssemblyName = SanitizeForAssemblyName(appName);
        ReplaceTokens(Path.Combine(appRoot, "Program.cs"), appName, description, sanitizedAssemblyName);
        ReplaceTokens(Path.Combine(appRoot, "PhotinoWrapper.csproj"), appName, description, sanitizedAssemblyName);
    }

    private static void ReplaceTokens(string filePath, string appName, string description, string assemblyName)
    {
        if (!File.Exists(filePath))
        {
            return;
        }

        var content = File.ReadAllText(filePath);
        content = content.Replace("__APP_NAME__", string.IsNullOrWhiteSpace(appName) ? "Photino Wrapper" : appName);
        content = content.Replace("__APP_DESCRIPTION__", string.IsNullOrWhiteSpace(description) ? "Packaged via Electronifier." : description);
        content = content.Replace("__ASSEMBLY_NAME__", string.IsNullOrWhiteSpace(assemblyName) ? "PhotinoWrapper" : assemblyName);
        File.WriteAllText(filePath, content);
    }

    private static string ResolveRuntimeIdentifier(PlatformTarget platform, Architecture architecture)
        => platform switch
        {
            PlatformTarget.macOS => architecture == Architecture.Arm64 ? "osx-arm64" : "osx-x64",
            PlatformTarget.Windows => architecture == Architecture.X86 ? "win-x86" : "win-x64",
            PlatformTarget.Linux => architecture == Architecture.Arm64 ? "linux-arm64" : "linux-x64",
            _ => "linux-x64"
        };

    private static async Task<ProcessRunResult> RunProcessAsync(string fileName, IEnumerable<string> arguments, string workingDirectory, CancellationToken cancellationToken, Action<string>? outputHandler = null)
    {
        var outputBuilder = new StringBuilder();

        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo(fileName)
                {
                    WorkingDirectory = workingDirectory,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            foreach (var arg in arguments)
            {
                process.StartInfo.ArgumentList.Add(arg);
            }

            process.OutputDataReceived += (_, e) =>
            {
                if (e.Data is null)
                {
                    return;
                }

                outputHandler?.Invoke(e.Data);
                outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (_, e) =>
            {
                if (e.Data is null)
                {
                    return;
                }

                outputHandler?.Invoke(e.Data);
                outputBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            return new ProcessRunResult(process.ExitCode == 0, outputBuilder.ToString());
        }
        catch (Exception ex)
        {
            return new ProcessRunResult(false, ex.Message);
        }
    }

    private static string SummarizeProcessOutput(string output)
    {
        if (string.IsNullOrWhiteSpace(output))
        {
            return "<no output>";
        }

        var lines = output.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        var top = lines.Take(6);
        var summary = string.Join(Environment.NewLine, top);

        if (lines.Length > 6)
        {
            summary += $"{Environment.NewLine}... ({lines.Length - 6} more lines)";
        }

        return summary;
    }

    private static void CopyDirectory(string sourceDir, string destinationDir)
    {
        var sourceDirectory = new DirectoryInfo(sourceDir);
        if (!sourceDirectory.Exists)
        {
            throw new DirectoryNotFoundException($"Source directory not found: {sourceDir}");
        }

        Directory.CreateDirectory(destinationDir);

        foreach (var file in sourceDirectory.GetFiles())
        {
            var destFilePath = Path.Combine(destinationDir, file.Name);
            file.CopyTo(destFilePath, true);
        }

        foreach (var subDir in sourceDirectory.GetDirectories())
        {
            var destSubDir = Path.Combine(destinationDir, subDir.Name);
            CopyDirectory(subDir.FullName, destSubDir);
        }
    }

    private static IReadOnlyList<BuildTarget> BuildTargets(ProjectDefinition project, ProjectRelease release, IEnumerable<PlatformTarget> platforms)
    {
        var targets = new List<BuildTarget>();
        var currentPlatform = PlatformDetector.GetCurrentPlatform();

        foreach (var platform in platforms)
        {
            // Only build for the current platform
            if (platform != currentPlatform)
            {
                continue;
            }

            switch (platform)
            {
                case PlatformTarget.macOS:
                    if (!string.IsNullOrWhiteSpace(project.MacBinPath))
                    {
                        targets.Add(new BuildTarget(platform, Architecture.Arm64, project.MacBinPath, "arm64"));
                    }
                    if (!string.IsNullOrWhiteSpace(project.MacBinPathX86))
                    {
                        targets.Add(new BuildTarget(platform, Architecture.X64, project.MacBinPathX86, "x86"));
                    }
                    break;

                case PlatformTarget.Windows:
                    if (!string.IsNullOrWhiteSpace(project.WindowsBinPath))
                    {
                        targets.Add(new BuildTarget(platform, Architecture.X64, project.WindowsBinPath, "x64"));
                    }
                    if (!string.IsNullOrWhiteSpace(project.WindowsBinPathX86))
                    {
                        targets.Add(new BuildTarget(platform, Architecture.X86, project.WindowsBinPathX86, "x86"));
                    }
                    break;

                case PlatformTarget.Linux:
                    if (!string.IsNullOrWhiteSpace(project.LinuxBinPath))
                    {
                        targets.Add(new BuildTarget(platform, Architecture.X64, project.LinuxBinPath, "x64"));
                    }
                    break;
            }

            if (targets.All(t => t.Platform != platform) && !string.IsNullOrWhiteSpace(project.BinPath))
            {
                targets.Add(new BuildTarget(platform, RuntimeInformation.ProcessArchitecture, project.BinPath, GetArchitectureLabel(RuntimeInformation.ProcessArchitecture)));
            }
        }

        return targets;
    }

    private static string GetArchitectureLabel(Architecture architecture)
        => architecture switch
        {
            Architecture.Arm64 => "arm64",
            Architecture.X64 => "x64",
            Architecture.X86 => "x86",
            Architecture.Arm => "arm",
            _ => "unknown"
        };

    private static async Task<string> CreateDebPackageAsync(ProjectDefinition project, ProjectRelease release, string safeProjectName, string safeVersion, string archSegment, string publishDir, string tempRoot, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var debArch = archSegment switch
        {
            "x64" => "amd64",
            "x86" => "i386",
            "arm64" => "arm64",
            "arm" => "armhf",
            _ => "amd64"
        };

        var packageName = SanitizeForFileSystem(project.Name).ToLowerInvariant().Replace("_", "-");
        if (string.IsNullOrWhiteSpace(packageName))
        {
            packageName = "electronifier-app";
        }

        var installRoot = Path.Combine("opt", safeProjectName);
        var controlContent = new StringBuilder()
            .AppendLine($"Package: {packageName}")
            .AppendLine($"Version: {safeVersion}")
            .AppendLine($"Architecture: {debArch}")
            .AppendLine("Priority: optional")
            .AppendLine("Section: misc")
            .AppendLine($"Maintainer: {project.Author ?? project.Organization ?? "Electronifier"}")
            .AppendLine($"Description: {(!string.IsNullOrWhiteSpace(project.Description) ? project.Description : "Packaged via Electronifier.")}")
            .ToString();

        var controlTarGz = CreateTarGz(tarWriter =>
        {
            var controlBytes = Encoding.UTF8.GetBytes(controlContent);
            using var controlStream = new MemoryStream(controlBytes, writable: false);
            var controlEntry = new PaxTarEntry(TarEntryType.RegularFile, "control")
            {
                Mode = (UnixFileMode)Convert.ToInt32("0644", 8),
                ModificationTime = DateTimeOffset.UtcNow,
                DataStream = controlStream
            };

            tarWriter.WriteEntry(controlEntry);
        });

        var dataTarGz = CreateTarGz(tarWriter =>
        {
            AddDirectoryToTar(tarWriter, publishDir, installRoot);
        });

        var debName = $"{safeProjectName}-linux-{archSegment}-{safeVersion}.deb";
        var debPath = Path.Combine(Path.GetDirectoryName(tempRoot) ?? tempRoot, debName);
        if (File.Exists(debPath))
        {
            File.Delete(debPath);
        }

        await using var debStream = File.Create(debPath);
        WriteArHeader(debStream);
        WriteArEntry(debStream, "debian-binary", Encoding.ASCII.GetBytes("2.0\n"));
        WriteArEntry(debStream, "control.tar.gz", controlTarGz);
        WriteArEntry(debStream, "data.tar.gz", dataTarGz);

        return debPath;
    }

    private static byte[] CreateTarGz(Action<TarWriter> writeEntries)
    {
        using var ms = new MemoryStream();
        using (var gzip = new GZipStream(ms, CompressionLevel.Optimal, leaveOpen: true))
        using (var tar = new TarWriter(gzip, TarEntryFormat.Pax, leaveOpen: true))
        {
            writeEntries(tar);
        }

        return ms.ToArray();
    }

    private static void AddDirectoryToTar(TarWriter tarWriter, string sourceDir, string targetRoot)
    {
        var dirEntry = new PaxTarEntry(TarEntryType.Directory, targetRoot + "/")
        {
            Mode = (UnixFileMode)Convert.ToInt32("0755", 8),
            ModificationTime = DateTimeOffset.UtcNow
        };
        tarWriter.WriteEntry(dirEntry);

        foreach (var filePath in Directory.EnumerateFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relativePath = Path.GetRelativePath(sourceDir, filePath).Replace("\\", "/");
            var entryPath = $"{targetRoot}/{relativePath}";
            var entry = new PaxTarEntry(TarEntryType.RegularFile, entryPath)
            {
                Mode = (UnixFileMode)Convert.ToInt32("0755", 8),
                ModificationTime = File.GetLastWriteTimeUtc(filePath),
            };

            using var fileStream = File.OpenRead(filePath);
            entry.DataStream = fileStream;
            tarWriter.WriteEntry(entry);
        }
    }

    private static void WriteArHeader(Stream stream)
    {
        var header = Encoding.ASCII.GetBytes("!<arch>\n");
        stream.Write(header, 0, header.Length);
    }

    private static void WriteArEntry(Stream stream, string name, byte[] data)
    {
        var fileName = name.EndsWith('/') ? name : name + "/";
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var owner = "0";
        var group = "0";
        var mode = "100644";
        var size = data.Length.ToString();

        var header = string.Format(CultureInfo.InvariantCulture,
            "{0,-16}{1,-12}{2,-6}{3,-6}{4,-8}{5,-10}`\n",
            fileName,
            timestamp,
            owner,
            group,
            mode,
            size);

        var headerBytes = Encoding.ASCII.GetBytes(header);
        stream.Write(headerBytes, 0, headerBytes.Length);
        stream.Write(data, 0, data.Length);

        if (data.Length % 2 != 0)
        {
            stream.WriteByte((byte)'\n');
        }
    }

    private static Task<(string Path, string? Note)> CreateWindowsPackageAsync(ProjectDefinition project, ProjectRelease release, string safeProjectName, string safeVersion, string archSegment, string publishDir, string tempRoot, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var artifactName = $"{safeProjectName}-windows-{archSegment}-{safeVersion}.zip";
        var artifactPath = Path.Combine(Path.GetDirectoryName(tempRoot) ?? tempRoot, artifactName);
        if (File.Exists(artifactPath))
        {
            File.Delete(artifactPath);
        }

        ZipFile.CreateFromDirectory(publishDir, artifactPath, CompressionLevel.Optimal, includeBaseDirectory: false);

        var note = "MSI packaging not implemented in this environment; produced ZIP instead.";
        if (OperatingSystem.IsWindows())
        {
            note = "MSI packaging requires WiX v4 CLI; produced ZIP fallback.";
        }

        return Task.FromResult((artifactPath, note));
    }

    private static bool TryParseGitHubRepository(string repositoryUrl, out string owner, out string repo)
    {
        owner = string.Empty;
        repo = string.Empty;

        if (string.IsNullOrWhiteSpace(repositoryUrl))
        {
            return false;
        }

        var pattern = @"github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)";
        var match = Regex.Match(repositoryUrl, pattern, RegexOptions.IgnoreCase);
        if (!match.Success)
        {
            return false;
        }

        owner = match.Groups["owner"].Value;
        repo = match.Groups["repo"].Value;
        return true;
    }

    private static void ReportStage(IProgress<ReleaseAutomationProgress>? progress, string message, double percent)
    {
        progress?.Report(new ReleaseAutomationProgress(message, Math.Clamp(percent, 0.0, 1.0)));
    }

    private static string SanitizeForFileSystem(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return "photino-wrapper";
        }

        var sanitized = Regex.Replace(input, @"[^\w\-]+", "-").Trim('-');
        return string.IsNullOrWhiteSpace(sanitized) ? "photino-wrapper" : sanitized.ToLowerInvariant();
    }

    private static string SanitizeForAssemblyName(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return "PhotinoWrapper";
        }

        var sanitized = Regex.Replace(input, @"[^\w]+", string.Empty);
        return string.IsNullOrWhiteSpace(sanitized) ? "PhotinoWrapper" : sanitized;
    }
}
