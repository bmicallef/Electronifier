using System.Security.Cryptography;
using System.Text;

namespace Electronifier.Core.Storage;

internal static class EncryptionHelper
{
    private static readonly byte[] Key = BuildEncryptionKey();

    public static string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText))
        {
            return string.Empty;
        }

        using var aes = Aes.Create();
        aes.Key = Key;
        aes.GenerateIV();
        using var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);
        var result = new byte[aes.IV.Length + cipherBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipherBytes, 0, result, aes.IV.Length, cipherBytes.Length);
        return Convert.ToBase64String(result);
    }

    public static string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText))
        {
            return string.Empty;
        }

        var buffer = Convert.FromBase64String(cipherText);
        using var aes = Aes.Create();
        aes.Key = Key;
        var iv = new byte[aes.BlockSize / 8];
        Buffer.BlockCopy(buffer, 0, iv, 0, iv.Length);
        aes.IV = iv;
        using var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);
        var cipher = new byte[buffer.Length - iv.Length];
        Buffer.BlockCopy(buffer, iv.Length, cipher, 0, cipher.Length);
        var plainBytes = decryptor.TransformFinalBlock(cipher, 0, cipher.Length);
        return Encoding.UTF8.GetString(plainBytes);
    }

    private static byte[] BuildEncryptionKey()
    {
        var machineSecret = $"{Environment.UserName}@{Environment.MachineName}@Electronifier";
        using var sha = SHA256.Create();
        return sha.ComputeHash(Encoding.UTF8.GetBytes(machineSecret));
    }
}
