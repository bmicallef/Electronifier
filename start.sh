#!/bin/bash

# Electronifier Start Script
# Cleans, builds, and runs the project

set -e  # Exit on any error

echo "🧹 Cleaning solution..."
dotnet clean Electronifier.sln

echo "🔨 Building solution..."
dotnet build Electronifier.sln

echo "🚀 Running Electronifier.Desktop..."
dotnet run --project src/Electronifier.Desktop/Electronifier.Desktop.csproj
