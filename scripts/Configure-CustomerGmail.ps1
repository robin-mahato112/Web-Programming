param(
    [Parameter(Mandatory = $true)][string]$BackendDirectory,
    [string]$ComposeProject,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$backendPath = [IO.Path]::GetFullPath($BackendDirectory)
$helperPath = Join-Path $PSScriptRoot 'configure-customer-gmail.js'
$envPath = Join-Path $backendPath '.customer.env'
$composePath = Join-Path $backendPath 'compose.yml'
if (!(Test-Path -LiteralPath $composePath)) { throw 'Course compose.yml was not found.' }
if ($ComposeProject) {
    $authContainer = & docker compose -p $ComposeProject -f $composePath ps -q auth
    if ($LASTEXITCODE -ne 0 -or !$authContainer) { throw 'The specified existing auth service was not found. Start it first.' }
}

# Check private file access before asking for credentials or sending a test email.
if (!(Test-Path -LiteralPath $envPath)) { New-Item -ItemType File -Path $envPath | Out-Null }
$fileAcl = New-Object Security.AccessControl.FileSecurity
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$accessSection = [Security.AccessControl.AccessControlSections]::Access
# Change only the DACL. Set-Acl can request audit privileges when given a new security descriptor.
# Preserve the file owner, group and audit settings; only the current user and SYSTEM may access it.
$fileAcl.SetSecurityDescriptorSddlForm(('D:P(A;;FA;;;SY)(A;;FA;;;' + $currentIdentity.Value + ')'), $accessSection)
if ($PSVersionTable.PSEdition -eq 'Desktop') {
    [IO.File]::SetAccessControl($envPath, $fileAcl)
    $savedAcl = [IO.File]::GetAccessControl($envPath, $accessSection)
} else {
    $envFileInfo = New-Object IO.FileInfo($envPath)
    [IO.FileSystemAclExtensions]::SetAccessControl($envFileInfo, $fileAcl)
    $savedAcl = [IO.FileSystemAclExtensions]::GetAccessControl($envFileInfo, $accessSection)
}
$savedRules = @($savedAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
$unexpectedRules = @($savedRules | Where-Object {
    $_.IsInherited -or $_.AccessControlType -ne 'Allow' -or
    $_.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or
    $_.IdentityReference.Value -notin @($currentIdentity.Value, 'S-1-5-18')
})
if (!$savedAcl.AreAccessRulesProtected -or $savedRules.Count -ne 2 -or $unexpectedRules.Count -ne 0) {
    throw 'Private credential file permissions could not be verified. No email has been sent.'
}
if ($CheckOnly) {
    Write-Host 'Setup prerequisites verified. No email sent or mail settings changed.'
    return
}

Write-Host 'Configure real Gmail delivery for customer password recovery.'
Write-Host 'Use a Google app password after enabling 2-Step Verification. Do not enter your normal Gmail password.'
$senderEmail = Read-Host 'Your Gmail address'
$testRecipient = Read-Host 'Your test recipient email (Enter = same Gmail address)'
if (!$testRecipient) { $testRecipient = $senderEmail }
$secretInput = Read-Host 'Google 16-character app password (hidden)' -AsSecureString
$secretPointer = [IntPtr]::Zero
$previousEncoding = $OutputEncoding
try {
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretInput)
    $secretText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    $verificationCode = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $requestJson = @{ email = $senderEmail; appPassword = $secretText; recipient = $testRecipient; code = $verificationCode; backendDirectory = $backendPath } | ConvertTo-Json -Compress
    $OutputEncoding = New-Object Text.UTF8Encoding($false)
    $requestJson | & $nodePath $helperPath verify
    if ($LASTEXITCODE -ne 0) { throw 'The delivery check failed. Existing mail settings are unchanged.' }
    $codeVerified = $false
    for ($codeAttempt = 1; $codeAttempt -le 3; $codeAttempt++) {
        $receivedCode = (Read-Host "Paste the 8-character code from the NEW test email (attempt $codeAttempt of 3)").Trim().ToLowerInvariant()
        if ($receivedCode -eq $verificationCode) {
            $codeVerified = $true
            break
        }
        if ($receivedCode -notmatch '^[a-f0-9]{8}$') {
            Write-Host 'The code must be exactly 8 characters. Copy only the code from the newest Entertainment Guild email.'
        } else {
            Write-Host 'That code does not match this setup attempt. Check the newest test email, not an earlier one.'
        }
    }
    if (!$codeVerified) {
        throw 'Verification failed after 3 attempts. Existing mail settings are unchanged.'
    }

    $requestJson | & $nodePath $helperPath save
    if ($LASTEXITCODE -ne 0) { throw 'Could not save Gmail settings.' }
    if ($ComposeProject) {
        & docker compose -p $ComposeProject -f $composePath up -d --no-deps --no-build auth
        if ($LASTEXITCODE -ne 0) { throw 'Settings saved, but auth did not restart. Check Docker Desktop.' }
        Write-Host 'Real email configured. Only auth was recreated; the database service was not changed.'
    } else { Write-Host 'Settings saved. Recreate the existing auth service to load them.' }
    Write-Host 'Now request a reset from the website for an existing customer email and check that inbox.'
} finally {
    if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
    $secretInput.Dispose()
    $OutputEncoding = $previousEncoding
    Remove-Variable secretText, requestJson, verificationCode, receivedCode -ErrorAction SilentlyContinue
}
