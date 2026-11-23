/* Chama o engine Python do SRTX como subprocesso, com o mesmo contrato JSON do
 * desktop (D-021). Nenhuma regra de transcrição/segmentação/SRT mora aqui. */
(function () {
  'use strict'

  var host = window.SRTXHost
  var fs = host.nodeRequire('fs')
  var path = host.nodeRequire('path')
  var os = host.nodeRequire('os')
  var childProcess = host.nodeRequire('child_process')
  var PROGRESS_PREFIX = 'SRT_PROGRESS '

  function exists(file) {
    try {
      return !!file && fs.existsSync(file)
    } catch (error) {
      return false
    }
  }

  function compareVersions(a, b) {
    var left = a.split('.').map(Number)
    var right = b.split('.').map(Number)
    for (var i = 0; i < Math.max(left.length, right.length); i++) {
      var diff = (left[i] || 0) - (right[i] || 0)
      if (diff) return diff
    }
    return 0
  }

  // Ordem: SRT_STUDIO_ENGINE → .venv do repositório (painel ligado por junction) → SRTX instalado.
  function resolveEngine() {
    if (!fs) return null
    var override = (process.env.SRT_STUDIO_ENGINE || '').trim()
    if (exists(override)) return { command: override, prefix: [], cwd: path.dirname(override), label: 'SRT_STUDIO_ENGINE' }

    var extension = host.extensionPath()
    if (extension) {
      var real = extension
      try { real = fs.realpathSync(extension) } catch (error) {}
      var repo = path.resolve(real, '..', '..')
      var python = path.join(repo, '.venv', 'Scripts', 'python.exe')
      if (exists(python) && exists(path.join(repo, 'engine', 'cli.py'))) {
        return { command: python, prefix: ['-X', 'utf8', '-m', 'engine.cli'], cwd: repo, label: 'repositório' }
      }
    }

    var installRoot = path.join(process.env.LOCALAPPDATA || '', 'SRTX')
    if (exists(installRoot)) {
      var versions = fs.readdirSync(installRoot)
        .filter(function (name) { return /^app-\d+(\.\d+)*$/.test(name) })
        .map(function (name) { return name.slice(4) })
        .sort(compareVersions)
        .reverse()
      for (var i = 0; i < versions.length; i++) {
        var exe = path.join(installRoot, 'app-' + versions[i], 'resources', 'srt-studio-engine', 'srt-studio-engine.exe')
        if (exists(exe)) return { command: exe, prefix: [], cwd: path.dirname(exe), label: 'SRTX ' + versions[i] }
      }
    }
    return null
  }

  var active = null

  // Executa um comando do engine. onProgress recebe {stage, progress}.
  function run(args, options) {
    options = options || {}
    return new Promise(function (resolve, reject) {
      if (!childProcess) return reject(new Error('Node.js não está ativo no painel'))
      var engine = resolveEngine()
      if (!engine) {
        return reject(new Error('Engine do SRTX não encontrado. Instale o SRTX ou rode scripts/install-premiere-panel.ps1 a partir do repositório.'))
      }
      var env = Object.assign({}, process.env, { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' })
      var child = childProcess.spawn(engine.command, engine.prefix.concat(args), {
        cwd: engine.cwd,
        env: env,
        windowsHide: true
      })
      active = child
      var stdout = ''
      var stderrBuffer = ''
      var lastError = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', function (chunk) { stdout += chunk })
      child.stderr.on('data', function (chunk) {
        stderrBuffer += chunk
        var lines = stderrBuffer.split(/\r?\n/)
        stderrBuffer = lines.pop()
        lines.forEach(function (line) {
          if (line.indexOf(PROGRESS_PREFIX) === 0) {
            try {
              if (options.onProgress) options.onProgress(JSON.parse(line.slice(PROGRESS_PREFIX.length)))
            } catch (error) {}
          } else if (line.trim()) {
            lastError = line.trim()
          }
        })
      })
      child.on('error', function (error) {
        active = null
        reject(error)
      })
      child.on('close', function (code, signal) {
        active = null
        if (stderrBuffer.trim()) lastError = stderrBuffer.trim()
        if (signal || child.srtxCancelled) return reject(new Error('Cancelado'))
        if (code !== 0) {
          var message = lastError
          try { message = JSON.parse(lastError).error || lastError } catch (error) {}
          return reject(new Error(message || 'O engine terminou com erro (' + code + ')'))
        }
        try {
          resolve(JSON.parse(stdout.trim().split(/\r?\n/).pop()))
        } catch (error) {
          reject(new Error('Resposta inválida do engine'))
        }
      })
      if (options.stdin !== undefined) {
        child.stdin.end(JSON.stringify(options.stdin), 'utf8')
      } else {
        child.stdin.end()
      }
    })
  }

  function cancel() {
    if (!active) return
    active.srtxCancelled = true
    try { active.kill() } catch (error) {}
  }

  function tempAudioPath(sequenceId) {
    var dir = path.join(os.tmpdir(), 'srtx-panel')
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, String(sequenceId).replace(/[^\w-]/g, '_') + '-' + Date.now() + '.wav')
  }

  function removeFile(file) {
    try { if (file) fs.unlinkSync(file) } catch (error) {}
  }

  function pad(n) { return n < 10 ? '0' + n : String(n) }

  // Nome novo a cada inserção: o SRT nunca sobrescreve outro (D-008).
  function captionsPath(projectFolder, sequenceName) {
    var base = projectFolder || path.join(os.homedir(), 'Documents')
    var dir = path.join(base, 'SRTX Legendas')
    fs.mkdirSync(dir, { recursive: true })
    var now = new Date()
    var stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + 'h' + pad(now.getMinutes())
    var safeName = String(sequenceName || 'Sequencia').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Sequencia'
    var candidate = path.join(dir, safeName + ' ' + stamp + '.srt')
    for (var i = 2; exists(candidate); i++) candidate = path.join(dir, safeName + ' ' + stamp + ' (' + i + ').srt')
    return candidate
  }

  function audioPreset(appPath) {
    var dir = path.join(appPath || '', 'Settings', 'EncoderPresets')
    var options = ['WAV_Mono_16bit_16kHz.epr', 'Wave48mono16.epr']
    for (var i = 0; i < options.length; i++) {
      if (exists(path.join(dir, options[i]))) return path.join(dir, options[i])
    }
    return null
  }

  // Estilos de texto salvos no Premiere ("My Styles > Local Styles"). Do arquivo
  // só dá para ler a fonte; cores ficam a cargo do painel (D-027).
  function listTextStyles() {
    if (!fs) return []
    var dir = path.join(os.homedir(), 'Documents', 'Adobe', 'Common', 'Assets', 'Text Styles')
    var names
    try { names = fs.readdirSync(dir) } catch (error) { return [] }
    return names.filter(function (name) { return /\.prtextstyle$/i.test(name) }).map(function (name) {
      var font = null
      try {
        var xml = fs.readFileSync(path.join(dir, name), 'utf8')
        var match = /<Name>Source Text<\/Name>[\s\S]*?<StartKeyframeValue[^>]*>([^<]+)</.exec(xml)
        if (match) {
          var text = Buffer.from(match[1].trim(), 'base64').toString('latin1')
          var fonts = text.match(/[A-Za-z][A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g) || text.match(/[A-Za-z]{4,}[A-Za-z0-9]*/g)
          if (fonts && fonts.length) font = fonts[0]
        }
      } catch (error) {}
      return {
        name: name.replace(/\.prtextstyle$/i, ''),
        font: font,
        family: font ? font.split('-')[0] : null
      }
    }).sort(function (a, b) { return a.name.localeCompare(b.name) })
  }

  // Modelos .mogrt da pasta "Local Templates" do Premiere (onde o Export as Motion
  // Graphics Template salva por padrão). Os mais recentes primeiro (D-028).
  function listMogrts() {
    if (!fs || !process.env.APPDATA) return []
    var root = path.join(process.env.APPDATA, 'Adobe', 'Common', 'Motion Graphics Templates')
    var found = []
    var walk = function (dir, depth) {
      var entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (error) { return }
      entries.forEach(function (entry) {
        var full = path.join(dir, entry.name)
        if (entry.isDirectory() && depth < 3) walk(full, depth + 1)
        else if (/\.mogrt$/i.test(entry.name)) {
          var time = 0
          try { time = fs.statSync(full).mtimeMs } catch (error) {}
          found.push({ name: entry.name.replace(/\.mogrt$/i, ''), file: full, folder: path.basename(dir), time: time })
        }
      })
    }
    walk(root, 0)
    return found.sort(function (a, b) { return b.time - a.time })
  }

  window.SRTXEngine = {
    listMogrts: listMogrts,
    listTextStyles: listTextStyles,
    available: !!childProcess,
    resolve: resolveEngine,
    run: run,
    cancel: cancel,
    tempAudioPath: tempAudioPath,
    removeFile: removeFile,
    captionsPath: captionsPath,
    audioPreset: audioPreset
  }
})()
