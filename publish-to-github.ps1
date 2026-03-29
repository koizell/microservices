param(
  [string]$Owner = 'koizell',
  [string]$Repo = 'microservices',
  [ValidateSet('public', 'private')]
  [string]$Visibility = 'private'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$portableGit = 'C:\Users\koizell\AppData\Local\PortableGit\current\mingw64\bin\git.exe'
$portableGh = 'C:\Users\koizell\AppData\Local\PortableGh\current\bin\gh.exe'

if (!(Test-Path $portableGit)) {
  throw "No se encontro Git portable en $portableGit"
}

if (!(Test-Path $portableGh)) {
  throw "No se encontro GitHub CLI portable en $portableGh"
}

Set-Location $root

& $portableGh auth status | Out-Null

$repoFullName = "$Owner/$Repo"
$remoteUrl = "https://github.com/$repoFullName.git"

$repoExists = $true
try {
  & $portableGh repo view $repoFullName | Out-Null
} catch {
  $repoExists = $false
}

if (-not $repoExists) {
  & $portableGh repo create $repoFullName --$Visibility --source $root --remote origin --push
  exit $LASTEXITCODE
}

$hasOrigin = (& $portableGit remote) -match '^origin$'
if ($hasOrigin) {
  & $portableGit remote set-url origin $remoteUrl
} else {
  & $portableGit remote add origin $remoteUrl
}

& $portableGit push -u origin main