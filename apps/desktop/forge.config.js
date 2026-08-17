const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const engineRuntime = path.join(repoRoot, 'dist', 'engine', 'srt-studio-engine')
const engineExe = path.join(engineRuntime, 'srt-studio-engine.exe')
const releaseDir = path.join(repoRoot, 'release', 'forge')

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
    name: 'SRT Studio',
    executableName: 'SRT Studio',
    extraResource: [engineRuntime],
    win32metadata: {
      CompanyName: 'SRT Studio',
      FileDescription: 'SRT Studio',
      ProductName: 'SRT Studio'
    }
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'SRTStudio',
        authors: 'Guilherme Estevão',
        description: 'Transcrição local e geração de SRT para edição rápida no Premiere.',
        setupExe: 'SRT-Studio-Setup.exe'
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

      if (!existsSync(engineExe)) {
        throw new Error(`Engine standalone não foi gerado em ${engineExe}`)
      }
    }
  }
}
