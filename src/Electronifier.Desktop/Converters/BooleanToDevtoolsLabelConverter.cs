using System;
using System.Globalization;
using Avalonia.Data.Converters;

namespace Electronifier.Desktop.Converters;

public sealed class BooleanToDevtoolsLabelConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var enabled = value is bool flag && flag;
        return enabled ? "Devtools enabled." : "Devtools disabled.";
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException("BooleanToDevtoolsLabelConverter does not support ConvertBack.");
    }
}
