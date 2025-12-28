@echo off
REM WalletWrapped Database Setup Script
REM Run this script to create the database and schema

echo Setting up WalletWrapped database...
echo.
echo This script will:
echo 1. Create the 'walletwrapped' database
echo 2. Apply the schema
echo.
echo You will be prompted for the PostgreSQL password (user: postgres)
echo.

SET PGPATH="C:\Program Files\PostgreSQL\16\bin"
SET PGUSER=postgres
SET DBNAME=walletwrapped

echo Step 1: Creating database...
%PGPATH%\createdb.exe -U %PGUSER% %DBNAME%
IF %ERRORLEVEL% NEQ 0 (
    echo Database may already exist, continuing...
)

echo.
echo Step 2: Applying schema...
%PGPATH%\psql.exe -U %PGUSER% -d %DBNAME% -f "server\src\database\schema.sql"

IF %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Database setup completed successfully!
    echo ========================================
) ELSE (
    echo.
    echo ========================================
    echo Database setup failed!
    echo ========================================
)

pause
