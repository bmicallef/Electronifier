using System.Runtime.InteropServices;
using Electronifier.Core.Models;

namespace Electronifier.Core.Services;

/// <summary>
/// Provides platform and architecture detection capabilities.
/// </summary>
public static class PlatformDetector
{
    /// <summary>
    /// Gets the current operating system platform.
    /// </summary>
    public static PlatformTarget GetCurrentPlatform()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            return PlatformTarget.macOS;
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return PlatformTarget.Windows;
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            return PlatformTarget.Linux;
        }

        // Default to Linux for unknown Unix-like systems
        return PlatformTarget.Linux;
    }

    /// <summary>
    /// Gets the current processor architecture.
    /// </summary>
    public static Architecture GetCurrentArchitecture()
    {
        return RuntimeInformation.ProcessArchitecture;
    }

    /// <summary>
    /// Determines whether the specified platform can be built on the current operating system.
    /// </summary>
    /// <param name="platform">The target platform to check.</param>
    /// <returns>True if the platform is supported on the current OS; otherwise, false.</returns>
    public static bool IsPlatformSupported(PlatformTarget platform)
    {
        var currentPlatform = GetCurrentPlatform();
        return currentPlatform == platform;
    }

    /// <summary>
    /// Determines whether the specified architecture is supported on the current platform.
    /// </summary>
    /// <param name="architecture">The target architecture to check.</param>
    /// <returns>True if the architecture is supported; otherwise, false.</returns>
    public static bool IsArchitectureSupported(Architecture architecture)
    {
        var currentArch = GetCurrentArchitecture();
        
        // Same architecture is always supported
        if (currentArch == architecture)
        {
            return true;
        }

        // x64 can typically build for x86 on the same platform
        if (currentArch == Architecture.Arm64 && architecture == Architecture.X64)
        {
            // ARM64 Macs can build x64 via Rosetta, but it's the same platform
            return GetCurrentPlatform() == PlatformTarget.macOS;
        }

        if (currentArch == Architecture.X64 && architecture == Architecture.X86)
        {
            return true;
        }

        return false;
    }
}
