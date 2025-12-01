using System;
using System.Globalization;
using Avalonia.Data.Converters;

namespace Electronifier.Desktop.Converters;

/// <summary>
/// Converts a boolean value to an opacity value for UI elements.
/// True = 1.0 (fully visible), False = 0.3 (greyed out).
/// </summary>
public sealed class BooleanToOpacityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var isSupported = value is bool flag && flag;
        return isSupported ? 1.0 : 0.3;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException("BooleanToOpacityConverter does not support ConvertBack.");
    }
}
