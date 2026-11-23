/* Aba Som: biblioteca de efeitos e músicas com prévia e inserção na agulha.
 * Pasta esperada: <raiz>/<Seção>/<Categoria>/arquivo (ex.: SFX/Impact/Boom.mp3).
 * A raiz vem de localStorage, senão de %APPDATA%\SRTX\sound-library.json. */
(function () {
  'use strict'

  var host = window.SRTXHost
  var fs = host.nodeRequire('fs')
  var path = host.nodeRequire('path')
  var ROOT_KEY = 'srtx.sound.root'
  var TRACK_KEY = 'srtx.sound.track'
  var FAVORITES_KEY = 'srtx.sound.favorites'
  var AUDIO = /\.(wav|mp3|m4a|aac|flac|ogg|aif|aiff)$/i
  var ALL = 'Tudo'
  var FAVORITES = '★ Favoritos'

  var lib = {
    root: '',
    sections: [], // [{name, categories: [{name, items: [{name, file}]}]}]
    section: null,
    category: ALL,
    query: '',
    playing: null,
    audio: null,
    durations: {},
    favorites: loadFavorites(),
    loaded: false
  }

  // Favoritos guardados pelo caminho do arquivo (valem em todas as seções).
  function loadFavorites() {
    try {
      var list = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
      var map = {}
      list.forEach(function (file) { map[file] = true })
      return map
    } catch (error) {
      return {}
    }
  }

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(Object.keys(lib.favorites))) } catch (error) {}
  }

  function toggleFavorite(item) {
    if (lib.favorites[item.file]) delete lib.favorites[item.file]
    else lib.favorites[item.file] = true
    saveFavorites()
    renderCategories()
    renderList()
  }

  var $ = function (id) { return document.getElementById(id) }

  function notify(message, kind) {
    if (window.SRTXApp) window.SRTXApp.notice(message, kind)
  }

  function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) { return null }
  }

  function defaultRoot() {
    try {
      var saved = localStorage.getItem(ROOT_KEY)
      if (saved) return saved
    } catch (error) {}
    if (!fs || !process.env.APPDATA) return ''
    var config = readJson(path.join(process.env.APPDATA, 'SRTX', 'sound-library.json'))
    return config && config.root ? config.root : ''
  }

  function listDir(dir) {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      return []
    }
  }

  function collectFiles(dir) {
    var out = []
    listDir(dir).forEach(function (entry) {
      var full = path.join(dir, entry.name)
      if (entry.isDirectory()) out = out.concat(collectFiles(full))
      else if (AUDIO.test(entry.name)) out.push(full)
    })
    return out
  }

  function toItem(file) {
    return { name: path.basename(file).replace(/\.[^.]+$/, ''), file: file }
  }

  function byName(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }) }

  function scan() {
    lib.sections = []
    if (!fs || !lib.root || !fs.existsSync(lib.root)) return
    var tops = listDir(lib.root).filter(function (entry) { return entry.isDirectory() })
    var groups = tops.length ? tops.map(function (entry) { return { name: entry.name, dir: path.join(lib.root, entry.name) } })
      : [{ name: 'Sons', dir: lib.root }]
    groups.forEach(function (group) {
      var categories = []
      var loose = []
      listDir(group.dir).forEach(function (entry) {
        var full = path.join(group.dir, entry.name)
        if (entry.isDirectory()) {
          var items = collectFiles(full).map(toItem).sort(byName)
          if (items.length) categories.push({ name: entry.name, items: items })
        } else if (AUDIO.test(entry.name)) {
          loose.push(toItem(full))
        }
      })
      if (loose.length) categories.push({ name: 'Outros', items: loose.sort(byName) })
      categories.sort(byName)
      if (categories.length) lib.sections.push({ name: group.name, categories: categories })
    })
    if (!lib.sections.some(function (s) { return s.name === lib.section })) {
      lib.section = lib.sections.length ? lib.sections[0].name : null
      lib.category = ALL
    }
  }

  function demo() {
    lib.sections = [
      { name: 'SFX', categories: [
        { name: 'Impact', items: ['Boom', 'Cinematic Hit 01', 'Cinematic Hit 02', 'Punch 01'].map(function (n) { return { name: n, file: '' } }) },
        { name: 'Meme', items: ['Bruh', 'Faah 01', 'Nope 01', 'Yeet'].map(function (n) { return { name: n, file: '' } }) },
        { name: 'Swoosh', items: ['Quick 01', 'Swoosh 01', 'Swoosh 02'].map(function (n) { return { name: n, file: '' } }) }
      ] },
      { name: 'Music', categories: [
        { name: 'Latin', items: ['Cumbia Fuego', 'Reggaeton 01'].map(function (n) { return { name: n, file: '' } }) }
      ] }
    ]
    lib.section = 'SFX'
  }

  function currentItems() {
    var section = lib.sections.filter(function (s) { return s.name === lib.section })[0]
    if (!section) return []
    var query = lib.query.trim().toLowerCase()
    var onlyFavorites = !query && lib.category === FAVORITES
    var items = []
    section.categories.forEach(function (category) {
      if (!query && !onlyFavorites && lib.category !== ALL && category.name !== lib.category) return
      category.items.forEach(function (item) {
        if (onlyFavorites && !lib.favorites[item.file]) return
        var haystack = (category.name + ' ' + item.name).toLowerCase()
        if (!query || query.split(/\s+/).every(function (part) { return haystack.indexOf(part) !== -1 })) {
          items.push({ name: item.name, file: item.file, category: category.name })
        }
      })
    })
    return items
  }

  function fileUrl(file) {
    return 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')
  }

  function formatDuration(seconds) {
    if (!isFinite(seconds)) return ''
    var s = Math.round(seconds * 10) / 10
    return s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2)
  }

  function stop() {
    if (lib.audio) {
      lib.audio.pause()
      lib.audio = null
    }
    lib.playing = null
  }

  function play(item, row) {
    var same = lib.playing === item.file
    stop()
    renderPlayingState()
    if (same || !item.file) return
    var audio = new Audio(fileUrl(item.file))
    lib.audio = audio
    lib.playing = item.file
    audio.addEventListener('loadedmetadata', function () {
      lib.durations[item.file] = audio.duration
      var label = row && row.querySelector('.sound-len')
      if (label) label.textContent = formatDuration(audio.duration)
    })
    audio.addEventListener('timeupdate', function () {
      var bar = row && row.querySelector('.sound-progress')
      if (bar && audio.duration) bar.style.width = (audio.currentTime / audio.duration) * 100 + '%'
    })
    audio.addEventListener('ended', function () {
      stop()
      renderPlayingState()
    })
    audio.play().catch(function () {
      notify('Não foi possível tocar este arquivo.', 'error')
      stop()
      renderPlayingState()
    })
    renderPlayingState()
  }

  function duration(file) {
    if (lib.durations[file]) return Promise.resolve(lib.durations[file])
    return new Promise(function (resolve) {
      var probe = new Audio()
      var done = false
      var finish = function (value) { if (!done) { done = true; resolve(value) } }
      probe.preload = 'metadata'
      probe.addEventListener('loadedmetadata', function () { lib.durations[file] = probe.duration; finish(probe.duration) })
      probe.addEventListener('error', function () { finish(2) })
      setTimeout(function () { finish(2) }, 3000)
      probe.src = fileUrl(file)
    })
  }

  function insert(item) {
    if (!host.available) return notify('Demonstração: no Premiere, o som entra na agulha da timeline.', 'ok')
    var track = Number($('sound-track').value)
    duration(item.file).then(function (seconds) {
      return host.evalHost('srtx_insertSound', [item.file, track, seconds])
    }).then(function (result) {
      notify('“' + item.name + '” inserido em A' + result.track + '.', 'ok')
    }).catch(function (error) {
      notify(error.message, 'error')
    })
  }

  // ---------- Render ----------
  function renderSections() {
    var box = $('sound-section')
    box.innerHTML = ''
    box.hidden = lib.sections.length < 2
    lib.sections.forEach(function (section) {
      var button = document.createElement('button')
      button.type = 'button'
      button.textContent = section.name
      button.classList.toggle('is-on', section.name === lib.section)
      button.addEventListener('click', function () {
        lib.section = section.name
        lib.category = ALL
        render()
      })
      box.appendChild(button)
    })
  }

  function renderCategories() {
    var box = $('sound-cats')
    box.innerHTML = ''
    var section = lib.sections.filter(function (s) { return s.name === lib.section })[0]
    if (!section) return
    var hasFavorites = section.categories.some(function (c) {
      return c.items.some(function (item) { return lib.favorites[item.file] })
    })
    if (lib.category === FAVORITES && !hasFavorites) lib.category = ALL
    var names = hasFavorites ? [FAVORITES, ALL] : [ALL]
    names.concat(section.categories.map(function (c) { return c.name })).forEach(function (name) {
      var chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip-filter' + (name === lib.category && !lib.query ? ' is-on' : '')
      chip.textContent = name
      chip.addEventListener('click', function () {
        lib.category = name
        lib.query = ''
        $('sound-search').value = ''
        render()
      })
      box.appendChild(chip)
    })
  }

  function renderList() {
    var list = $('sound-list')
    list.innerHTML = ''
    var items = currentItems()
    var empty = $('sound-empty')
    if (!lib.sections.length) {
      empty.hidden = false
      empty.textContent = lib.root ? 'Nenhum som encontrado nesta pasta.' : 'Escolha a pasta da sua biblioteca de sons em “Pasta…”.'
      return
    }
    empty.hidden = items.length > 0
    empty.textContent = 'Nada encontrado para “' + lib.query + '”.'
    var showCategory = !!lib.query || lib.category === ALL
    var fragment = document.createDocumentFragment()
    items.forEach(function (item) {
      var li = document.createElement('li')
      li.className = 'sound-row'
      li.dataset.file = item.file

      var playButton = document.createElement('button')
      playButton.type = 'button'
      playButton.className = 'sound-play'
      playButton.title = 'Ouvir'
      playButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-play" d="M5 3.5v9l7.5-4.5z"/><path class="i-stop" d="M4.5 4.5h7v7h-7z"/></svg>'

      var label = document.createElement('div')
      label.className = 'sound-label'
      var name = document.createElement('span')
      name.className = 'sound-name'
      name.textContent = item.name
      label.appendChild(name)
      if (showCategory) {
        var cat = document.createElement('span')
        cat.className = 'sound-cat'
        cat.textContent = item.category
        label.appendChild(cat)
      }
      var progress = document.createElement('i')
      progress.className = 'sound-progress'
      label.appendChild(progress)

      var len = document.createElement('span')
      len.className = 'sound-len'
      len.textContent = formatDuration(lib.durations[item.file])

      var star = document.createElement('button')
      star.type = 'button'
      var favorite = !!lib.favorites[item.file]
      star.className = 'sound-star' + (favorite ? ' is-on' : '')
      star.title = favorite ? 'Tirar dos favoritos' : 'Favoritar'
      star.setAttribute('aria-pressed', String(favorite))
      star.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2l1.75 3.55 3.92.57-2.84 2.77.67 3.9L8 11.15 4.5 13l.67-3.9L2.33 6.32l3.92-.57z"/></svg>'
      star.addEventListener('click', function (event) {
        event.stopPropagation()
        toggleFavorite(item)
      })

      var add = document.createElement('button')
      add.type = 'button'
      add.className = 'sound-add'
      add.title = 'Inserir na agulha'
      add.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>'

      playButton.addEventListener('click', function () { play(item, li) })
      label.addEventListener('click', function () { play(item, li) })
      li.addEventListener('dblclick', function () { insert(item) })
      add.addEventListener('click', function () { insert(item) })

      li.appendChild(playButton)
      li.appendChild(label)
      li.appendChild(len)
      li.appendChild(star)
      li.appendChild(add)
      fragment.appendChild(li)
    })
    list.appendChild(fragment)
    renderPlayingState()
  }

  function renderPlayingState() {
    Array.prototype.forEach.call(document.querySelectorAll('.sound-row'), function (row) {
      var on = !!lib.playing && row.dataset.file === lib.playing
      row.classList.toggle('is-playing', on)
      if (!on) {
        var bar = row.querySelector('.sound-progress')
        if (bar) bar.style.width = '0'
      }
    })
  }

  function render() {
    renderSections()
    renderCategories()
    renderList()
  }

  function refreshTracks() {
    var select = $('sound-track')
    var saved = '-1'
    try { saved = localStorage.getItem(TRACK_KEY) || '-1' } catch (error) {}
    var fill = function (count) {
      select.innerHTML = ''
      var auto = document.createElement('option')
      auto.value = '-1'
      auto.textContent = 'Livre (auto)'
      select.appendChild(auto)
      for (var i = 0; i < count; i++) {
        var option = document.createElement('option')
        option.value = String(i)
        option.textContent = 'A' + (i + 1)
        select.appendChild(option)
      }
      select.value = Number(saved) < count ? saved : '-1'
    }
    if (!host.available) return fill(4)
    host.evalHost('srtx_audioTrackCount').then(function (result) { fill(result.count) }).catch(function () { fill(0) })
  }

  function chooseFolder() {
    var cepFs = window.cep && window.cep.fs
    if (!cepFs || !cepFs.showOpenDialogEx) return notify('Abra o painel dentro do Premiere para escolher a pasta.', 'error')
    var result = cepFs.showOpenDialogEx(false, true, 'Pasta da biblioteca de sons', lib.root || '')
    if (result && !result.err && result.data && result.data.length) {
      lib.root = result.data[0]
      try { localStorage.setItem(ROOT_KEY, lib.root) } catch (error) {}
      scan()
      render()
    }
  }

  function show() {
    if (!lib.loaded) {
      lib.loaded = true
      lib.root = defaultRoot()
      if (host.available) scan()
      else demo()
    }
    refreshTracks()
    render()
  }

  function hide() {
    stop()
    renderPlayingState()
  }

  function bind() {
    $('sound-search').addEventListener('input', function () {
      lib.query = this.value
      renderCategories()
      renderList()
    })
    $('sound-track').addEventListener('change', function () {
      try { localStorage.setItem(TRACK_KEY, this.value) } catch (error) {}
    })
    $('sound-folder').addEventListener('click', chooseFolder)
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && lib.playing) {
        stop()
        renderPlayingState()
      }
    })
  }

  bind()
  window.SRTXLibrary = { show: show, hide: hide, rescan: function () { scan(); render() } }
})()
