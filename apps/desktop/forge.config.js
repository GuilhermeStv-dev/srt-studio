const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const engineRuntime = path.join(repoRoot, 'dist', 'engine', 'srt-studio-engine')
const engineExe = path.join(engineRuntime, 'srt-studio-engine.exe')
const releaseDir = path.join(repoRoot, 'release', 'forge')
const brandingDir = path.join(repoRoot, 'build', 'branding')
const brandIcon = path.join(brandingDir, 'srtx.ico')
const brandPng = path.join(brandingDir, 'srtx.png')
const brandIconScript = path.join(repoRoot, 'scripts', 'build-brand-icon.py')
const projectPython = path.join(repoRoot, '.venv', 'Scripts', 'python.exe')

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true
  })
}

module.exports = {
  outDir: releaseDir,
  packagerConfig: {
    asar: true,
    junk: false,
    // Forge 7 ignora /^\/out\// por padrão, mas electron-vite usa out/ como
    // build de produção. Sobrescrevemos o ignore para preservar esse entrypoint.
    ignore: [
      /^\/src\//,
      /^\/forge\.config\.js$/,
      /^\/tsconfig\.json$/,
      /^\/electron\.vite\.config\.(js|ts)$/
    ],
    name: 'SRTX',
    executableName: 'SRTX',
    icon: brandIcon,
    extraResource: [engineRuntime, brandIcon, brandPng],
    win32metadata: {
      CompanyName: 'Guilherme Estevão',
      FileDescription: 'SRTX — Guilherme Estevão Editor',
      ProductName: 'SRTX'
    }
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        // Mantém o ID interno para preservar o caminho de atualização da instalação anterior.
        name: 'SRTStudio',
        title: 'SRTX',
        authors: 'Guilherme Estevão',
        description: 'SRTX — transcrição local e geração de SRT para edição rápida no Premiere.',
        exe: 'SRTX.exe',
        setupExe: 'SRTX-Setup.exe',
        setupIcon: brandIcon
      }
    }
  ],
  hooks: {
    prePackage: async () => {
      if (process.platform !== 'win32') {
        throw new Error('O instalador Windows deve ser gerado em um host Windows.')
      }

      run('cmd.exe', ['/d', '/s', '/c', 'npm run build'], __dirname)
      run(
        'pwsh',
        ['-ExecutionPolicy', 'Bypass', '-File', path.join(repoRoot, 'scripts', 'build-engine.ps1')],
        repoRoot
      )
      run(projectPython, [brandIconScript], repoRoot)

      if (!existsSync(engineExe)) {
        throw new Error(`Engine standalone não foi gerado em ${engineExe}`)
      }
      if (!existsSync(brandIcon) || !existsSync(brandPng)) {
        throw new Error('Assets SRTX de ícone não foram gerados para o pacote Windows.')
      }
    }
  }
}
