const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const engineRuntime = path.join(repoRoot, 'dist', 'engine', 'srt-studio-engine')
const engineExe = path.join(
  engineRuntime,
  process.platform === 'win32' ? 'srt-studio-engine.exe' : 'srt-studio-engine'
)
const releaseDir = path.join(repoRoot, 'release', 'forge')
const brandingDir = path.join(repoRoot, 'build', 'branding')
const brandIcon = path.join(brandingDir, 'srtx.ico')
const brandPng = path.join(brandingDir, 'srtx.png')
// Sem extensão: o packager escolhe srtx.ico no Windows e srtx.icns no macOS.
const brandIconBase = path.join(brandingDir, 'srtx')
const brandIconScript = path.join(repoRoot, 'scripts', 'build-brand-icon.mjs')
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
    icon: brandIconBase,
    appBundleId: 'dev.guilhermestv.srtx',
    appCategoryType: 'public.app-category.video',
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
        name: 'SRTX',
        title: 'SRTX',
        authors: 'Guilherme Estevão',
        description: 'SRTX — transcrição local e geração de SRT para edição rápida no Premiere.',
        exe: 'SRTX.exe',
        setupExe: 'SRTX-Setup.exe',
        setupIcon: brandIcon
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    }
  ],
  hooks: {
    prePackage: async () => {
      if (process.platform === 'win32') {
        run('cmd.exe', ['/d', '/s', '/c', 'npm run build'], __dirname)
        run(
          'pwsh',
          ['-ExecutionPolicy', 'Bypass', '-File', path.join(repoRoot, 'scripts', 'build-engine.ps1')],
          repoRoot
        )
      } else if (process.platform === 'darwin') {
        run('npm', ['run', 'build'], __dirname)
        run('bash', [path.join(repoRoot, 'scripts', 'build-engine.sh')], repoRoot)
      } else {
        throw new Error('O SRTX é empacotado apenas em hosts Windows ou macOS.')
      }
      run(process.execPath, [brandIconScript], repoRoot)

      if (!existsSync(engineExe)) {
        throw new Error(`Engine standalone não foi gerado em ${engineExe}`)
      }
      if (!existsSync(brandIcon) || !existsSync(brandPng) || !existsSync(`${brandIconBase}.icns`)) {
        throw new Error('Assets SRTX de ícone não foram gerados para o pacote.')
      }
    },
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== 'darwin') return

      // Apple Silicon recusa binários sem assinatura ("app danificado").
      // Sem conta Apple Developer, usamos assinatura ad-hoc.
      for (const outputPath of outputPaths) {
        const appBundle = path.join(outputPath, 'SRTX.app')
        run('codesign', ['--force', '--deep', '--sign', '-', appBundle], outputPath)
        run('codesign', ['--verify', '--deep', '--strict', appBundle], outputPath)
      }
    }
  }
}
