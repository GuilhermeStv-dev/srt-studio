# Liga o painel SRTX do repositório ao Premiere (D-021), para desenvolvimento.
# Cria uma junction em %APPDATA%\Adobe\CEP\extensions\com.srtx.panel apontando
# para apps\premiere-panel: editar o código e reabrir o painel já reflete a mudança.
# Painéis CEP sem assinatura exigem PlayerDebugMode=1 (configuração do Adobe no HKCU).

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repo 'apps\premiere-panel'
$extensions = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$target = Join-Path $extensions 'com.srtx.panel'

New-Item -ItemType Directory -Force $extensions | Out-Null

if (Test-Path $target) {
  $item = Get-Item $target -Force
  if ($item.LinkType -eq 'Junction' -and $item.Target -contains $source) {
    Write-Host "Painel já instalado: $target -> $source"
  } else {
    throw "Já existe $target e não é a junction do repositório. Remova-o manualmente se quiser substituir."
  }
} else {
  New-Item -ItemType Junction -Path $target -Target $source | Out-Null
  Write-Host "Painel instalado: $target -> $source"
}

foreach ($version in 9..16) {
  $key = "HKCU:\Software\Adobe\CSXS.$version"
  $current = (Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode
  if ($current -ne '1') {
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -Path $key -Name PlayerDebugMode -Value '1'
    Write-Host "PlayerDebugMode=1 em CSXS.$version"
  }
}

if (-not (Test-Path (Join-Path $repo '.venv\Scripts\python.exe'))) {
  Write-Host 'Aviso: sem .venv no repositório. O painel vai usar o engine do SRTX instalado.'
}
Write-Host 'Reabra o Premiere e abra Janela > Extensões > SRTX.'
