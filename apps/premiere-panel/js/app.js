/* Painel SRTX — estado da interface e fluxo Áudio → Texto → Legendas (D-021).
 * A interface só dispara operações: Premiere (host.jsx) e engine Python fazem o trabalho. */
(function () {
  'use strict'

  var host = window.SRTXHost
  var engine = window.SRTXEngine
  var DEMO = !host.available
  var SETTINGS_KEY = 'srtx.panel.settings.v1'
  var MAX_MULTI_WORD_CHARS = 17

  var $ = function (id) { return document.getElementById(id) }

  var defaults = {
    range: 'all',
    language: 'es',
    model: 'large-v3',
    segmentation: { target_words: 1, ignore_prepositions: true, preserve_commas_periods: true, monetary_thousands: false },
    // Estilo opcional na inserção (D-027): 'none' | 'srtx' | 'saved:<nome do estilo>'.
    // mode: 'graphic' = clipes de texto a partir de um .mogrt (D-028); 'native' = trilha de legendas.
    captionStyle: { mode: 'graphic', mogrt: '', id: 'none', color: '#ffc400', outline: '#000000', outlineWidth: 4 }
  }

  var state = {
    tab: 'audio',
    busy: false,
    sequence: null,
    projectFolder: '',
    appPath: '',
    settings: loadSettings(),
    audioPath: null,
    offset: 0,
    language: null,
    segments: [],
    words: [],
    captions: [],
    captionsSegmentation: null,
    textChangedAfterCaptions: false,
    activeCue: -1
  }

  function loadSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
      if (saved && saved.segmentation) {
        return Object.assign({}, defaults, saved, {
          segmentation: Object.assign({}, defaults.segmentation, saved.segmentation),
          captionStyle: Object.assign({}, defaults.captionStyle, saved.captionStyle)
        })
      }
    } catch (error) {}
    return JSON.parse(JSON.stringify(defaults))
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)) } catch (error) {}
  }

  // ---------- Tema: acompanha a cor do Premiere ----------
  function shade(rgb, amount) {
    return 'rgb(' + rgb.map(function (v) { return Math.round(Math.min(255, v + (255 - v) * amount)) }).join(',') + ')'
  }

  function applyTheme() {
    var skin = host.hostSkin()
    var color = skin && skin.panelBackgroundColor && skin.panelBackgroundColor.color
    if (!color) return
    var rgb = [color.red, color.green, color.blue].map(function (v) { return Math.round(Number(v) || 0) })
    var root = document.documentElement.style
    root.setProperty('--bg', 'rgb(' + rgb.join(',') + ')')
    root.setProperty('--surface-1', shade(rgb, 0.04))
    root.setProperty('--surface-2', shade(rgb, 0.08))
    root.setProperty('--surface-3', shade(rgb, 0.13))
  }

  // ---------- Utilidades ----------
  function formatTime(seconds) {
    var total = Math.max(0, seconds)
    var m = Math.floor(total / 60)
    var s = Math.floor(total % 60)
    var cs = Math.floor((total * 100) % 100)
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (cs < 10 ? '0' : '') + cs
  }

  function sameSegmentation(a, b) {
    return !!a && !!b && a.target_words === b.target_words && a.ignore_prepositions === b.ignore_prepositions &&
      a.preserve_commas_periods === b.preserve_commas_periods && a.monetary_thousands === b.monetary_thousands
  }

  function notice(message, kind) {
    var el = $('notice')
    if (!message) { el.hidden = true; return }
    el.textContent = message
    el.className = 'notice' + (kind ? ' ' + kind : '')
    el.hidden = false
  }

  // ---------- Progresso ----------
  var progressSteps = []

  function startProgress(labels) {
    progressSteps = labels
    var list = $('steps')
    list.innerHTML = ''
    labels.forEach(function (label) {
      var li = document.createElement('li')
      li.className = 'step'
      li.textContent = label
      list.appendChild(li)
    })
    $('progress').hidden = false
    setStep(0, null)
  }

  function setStep(index, progress) {
    var items = $('steps').children
    for (var i = 0; i < items.length; i++) {
      items[i].className = 'step' + (i < index ? ' is-done' : i === index ? ' is-running' : '')
    }
    var fill = $('bar-fill')
    if (progress === null || progress === undefined) {
      fill.classList.add('indet')
      fill.style.width = ''
      $('pct').textContent = ''
    } else {
      fill.classList.remove('indet')
      var overall = (index + Math.max(0, Math.min(1, progress))) / progressSteps.length
      fill.style.width = Math.round(overall * 100) + '%'
      $('pct').textContent = Math.round(progress * 100) + '%'
    }
  }

  function stopProgress() {
    $('progress').hidden = true
  }

  function setBusy(busy) {
    state.busy = busy
    render()
  }

  // ---------- Sequência ativa ----------
  function refreshSequence() {
    if (DEMO) {
      state.sequence = { id: 'demo', name: 'Entrevista — demonstração', duration: 754, inPoint: 0, outPoint: 754 }
      render()
      return Promise.resolve()
    }
    return host.evalHost('srtx_sequenceInfo').then(function (info) {
      var changed = (state.sequence && state.sequence.id) !== (info.sequence && info.sequence.id)
      state.sequence = info.sequence
      state.projectFolder = info.projectFolder || ''
      state.appPath = info.appPath || ''
      if (changed && state.segments.length) {
        notice('A sequência ativa mudou. O texto e as legendas continuam sendo da sequência anterior.', '')
      }
      render()
    }).catch(function (error) {
      notice(error.message, 'error')
    })
  }

  // ---------- Etapa 1: áudio + transcrição ----------
  function transcribe() {
    if (!state.sequence) return notice('Abra uma sequência no Premiere.', 'error')
    notice(null)
    var settings = state.settings
    if (DEMO) return demoTranscribe()

    var preset = engine.audioPreset(state.appPath)
    if (!preset) return notice('Não encontrei o preset de áudio WAV do Premiere.', 'error')
    if (!engine.resolve()) {
      return notice('Engine do SRTX não encontrado. Instale o SRTX no computador para usar o painel.', 'error')
    }

    setBusy(true)
    startProgress(['Renderizar áudio da timeline', 'Carregar modelo', 'Transcrever'])
    var audioPath = engine.tempAudioPath(state.sequence.id)

    // Deixa o navegador desenhar o progresso antes do export síncrono do Premiere.
    return new Promise(function (resolve) { setTimeout(resolve, 60) })
      .then(function () { return host.evalHost('srtx_exportAudio', [audioPath, preset, settings.range]) })
      .then(function (exported) {
        engine.removeFile(state.audioPath)
        state.audioPath = exported.path
        // Deslocamento só faz sentido positivo (In definido); qualquer outro valor = 0.
        state.offset = Number(exported.offset) > 0 ? Number(exported.offset) : 0
        setStep(1, null)
        return engine.run(
          ['transcribe-text', exported.path, '--model', settings.model, '--language', settings.language, '--progress-events'],
          { onProgress: function (event) {
            if (event.stage === 'transcribing') setStep(2, event.progress)
            else if (event.stage === 'loading_model' || event.stage === 'preparing') setStep(1, null)
          } }
        )
      })
      .then(function (result) {
        state.segments = (result.segments || []).filter(function (segment) { return segment.text && segment.text.trim() })
        state.language = result.language || settings.language
        state.words = []
        state.captions = []
        state.captionsSegmentation = null
        if (!state.segments.length) throw new Error('Nenhuma fala encontrada no áudio.')
        state.tab = 'texto'
        renderParagraphs()
      })
      .catch(function (error) {
        if (error.message !== 'Cancelado') notice(error.message, 'error')
      })
      .then(function () {
        stopProgress()
        setBusy(false)
      })
  }

  // ---------- Etapa 2: texto → legendas sincronizadas ----------
  function generateCaptions() {
    var segments = collectParagraphs()
    if (!segments.length) return notice('O texto está vazio.', 'error')
    notice(null)
    if (DEMO) return demoCaptions()

    setBusy(true)
    startProgress(['Carregar sincronização', 'Sincronizar palavras', 'Montar legendas'])
    var segmentation = Object.assign({}, state.settings.segmentation)
    return engine.run(
      ['caption', state.audioPath, '--language', state.language || state.settings.language, '--progress-events'],
      {
        stdin: { segments: segments, segmentation: segmentation },
        onProgress: function (event) {
          if (event.stage === 'loading_aligner') setStep(0, null)
          else if (event.stage === 'aligning') setStep(1, event.progress)
          else if (event.stage === 'completed') setStep(2, 1)
        }
      }
    )
      .then(function (result) {
        state.words = result.words || []
        state.captions = result.captions || []
        state.captionsSegmentation = result.segmentation || segmentation
        state.textChangedAfterCaptions = false
        state.tab = 'legendas'
      })
      .catch(function (error) {
        if (error.message !== 'Cancelado') notice(error.message, 'error')
      })
      .then(function () {
        stopProgress()
        setBusy(false)
      })
  }

  // Reaplica densidade/opções sem sincronizar de novo (comando `segment`).
  function regenerate() {
    if (!state.words.length) return
    if (DEMO) { state.captionsSegmentation = Object.assign({}, state.settings.segmentation); return render() }
    setBusy(true)
    var segmentation = Object.assign({}, state.settings.segmentation)
    engine.run(['segment'], { stdin: { words: state.words, segmentation: segmentation } })
      .then(function (result) {
        state.captions = result.captions || []
        state.captionsSegmentation = result.segmentation || segmentation
      })
      .catch(function (error) { notice(error.message, 'error') })
      .then(function () { setBusy(false) })
  }

  // ---------- Etapa 3: inserir na timeline ----------
  function insertCaptions() {
    if (!state.captions.length) return
    notice(null)
    if (DEMO) return notice('Demonstração: no Premiere, as legendas entram numa trilha de legendas nova.', 'ok')
    // Deslocamento negativo/inválido (In não definido no Premiere) nunca vale.
    state.offset = Number(state.offset) > 0 ? Number(state.offset) : 0

    // Clipes de texto só com um modelo escolhido; sem modelo, nunca trava a inserção:
    // entra como legenda nativa (com o estilo escolhido) e avisa.
    var graphicReady = state.settings.captionStyle.mode === 'graphic' && state.settings.captionStyle.mogrt
    if (graphicReady) return insertGraphicCaptions()
    var fellBack = state.settings.captionStyle.mode === 'graphic'

    setBusy(true)
    startProgress(['Gravar legendas', 'Criar trilha de legendas'])
    var output = engine.captionsPath(state.projectFolder, state.sequence ? state.sequence.name : '')
    var styled = output.replace(/\.srt$/i, '.xml')
    var seq = state.sequence || {}
    var choice = state.settings.captionStyle
    var saved = savedStyle(choice.id)
    var useStyle = choice.id !== 'none'
    var captions = state.captions.map(function (cue) { return { text: cue.text, start: cue.start, end: cue.end } })
    var payload = { stdin: { captions: captions } }
    // D-027: com estilo, o TTML leva 122, centro, embaixo e zona do meio (+ fonte e
    // cores do estilo salvo). Se o Premiere recusar o TTML, entra o SRT de sempre.
    return engine.run(['export-srt', '--output', output], payload)
      .then(function () {
        if (!useStyle) return null
        var args = [
          'export-ttml', '--output', styled, '--font-size', '122',
          '--width', String(seq.width || 1920), '--height', String(seq.height || 1080)
        ]
        if (saved) {
          // O Premiere identifica fontes pelo nome técnico (PostScript), o mesmo
          // gravado no estilo salvo: "Portlin-Normal", não "Portlin".
          if (saved.font || saved.family) args.push('--font-family', saved.font || saved.family)
          args.push('--color', choice.color)
          if (Number(choice.outlineWidth) > 0) args.push('--outline-color', choice.outline, '--outline-width', String(Math.round(choice.outlineWidth)))
        }
        return engine.run(args, payload)
      })
      .then(function () {
        setStep(1, null)
        if (!useStyle) return host.evalHost('srtx_insertCaptions', [output, state.offset]).then(function () { return 'plain' })
        return host.evalHost('srtx_insertCaptions', [styled, state.offset])
          .then(function () { return 'styled' })
          .catch(function () {
            return host.evalHost('srtx_insertCaptions', [output, state.offset]).then(function () { return 'fallback' })
          })
      })
      .then(function (kind) {
        var messages = {
          plain: 'Legendas inseridas no padrão do Premiere.',
          styled: 'Legendas inseridas com o estilo “' + styleLabel(choice.id) + '”.',
          fallback: 'O Premiere não aceitou o arquivo com estilo; as legendas entraram sem estilo.'
        }
        var prefix = fellBack ? 'Sem modelo de clipe escolhido: inseri como legenda nativa. ' : ''
        notice(prefix + messages[kind], kind === 'fallback' ? '' : 'ok')
      })
      .catch(function (error) {
        if (error.message !== 'Cancelado') notice(error.message, 'error')
      })
      .then(function () {
        stopProgress()
        setBusy(false)
      })
  }

  // ---------- Legendas como clipes de texto (D-028) ----------
  var GRAPHIC_BATCH = 12
  var LINE_SEPARATORS = new RegExp('[' + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + ']', 'g')

  function insertGraphicCaptions() {
    var mogrt = state.settings.captionStyle.mogrt
    if (!mogrt) return notice('Escolha o modelo de legenda (.mogrt) em “Estilo ao inserir”.', 'error')
    // Modelos SRTX vêm em par (Vertical/Horizontal): usa o do formato da sequência.
    var seq = state.sequence || {}
    var vertical = (seq.height || 1080) > (seq.width || 1920)
    var sibling = mogrt.replace(/(Vertical|Horizontal)(\.mogrt)$/i, (vertical ? 'Vertical' : 'Horizontal') + '$2')
    if (sibling !== mogrt && (mogrts || []).some(function (item) { return item.file === sibling })) mogrt = sibling
    var offset = state.offset
    var cues = state.captions.map(function (cue) {
      // U+2028/2029 quebram o eval do ExtendScript: viram espaço.
      return { t: String(cue.text).replace(LINE_SEPARATORS, ' ').trim(), s: cue.start + offset, e: cue.end + offset }
    })
    var batches = []
    for (var i = 0; i < cues.length; i += GRAPHIC_BATCH) batches.push(cues.slice(i, i + GRAPHIC_BATCH))
    var output = engine.captionsPath(state.projectFolder, state.sequence ? state.sequence.name : '')
    var total = { inserted: 0, textFailed: 0 }
    var track = null

    setBusy(true)
    startProgress(['Gravar SRT de arquivo', 'Preparar trilha de vídeo', 'Inserir legendas'])
    var captions = state.captions.map(function (cue) { return { text: cue.text, start: cue.start, end: cue.end } })
    return engine.run(['export-srt', '--output', output], { stdin: { captions: captions } })
      .then(function () {
        setStep(1, null)
        return host.evalHost('srtx_prepareGraphicTrack', [cues[0].s, cues[cues.length - 1].e])
      })
      .then(function (result) {
        track = result.track
        // Um lote por vez: o Premiere fica livre para desenhar o progresso entre eles.
        return batches.reduce(function (chain, batch, index) {
          return chain.then(function () {
            setStep(2, index / batches.length)
            return host.evalHost('srtx_insertGraphicCaptions', [mogrt, JSON.stringify(batch), track]).then(function (done) {
              total.inserted += done.inserted
              total.textFailed += done.textFailed
            })
          })
        }, Promise.resolve())
      })
      .then(function () {
        setStep(2, 1)
        if (total.textFailed) {
          notice(total.inserted + ' clipes inseridos em V' + (track + 1) + ', mas o texto não pôde ser trocado em ' + total.textFailed + '. Use um modelo SRTX Legenda (feito no After Effects): modelos exportados do Premiere não deixam trocar o texto por script.', 'error')
        } else {
          notice(total.inserted + ' legendas inseridas como clipes de texto em V' + (track + 1) + '.', 'ok')
        }
      })
      .catch(function (error) {
        if (error.message !== 'Cancelado') notice(error.message, 'error')
      })
      .then(function () {
        stopProgress()
        setBusy(false)
      })
  }

  var mogrts = null

  function renderMogrtPicker(refresh) {
    if (mogrts === null || refresh) mogrts = DEMO ? [{ name: 'SRTX Legenda Nuevabet', file: 'demo.mogrt', folder: 'Local' }] : engine.listMogrts()
    var select = $('caption-mogrt')
    var choice = state.settings.captionStyle
    select.innerHTML = ''
    var placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = mogrts.length ? 'Escolha o modelo…' : 'Nenhum modelo encontrado'
    select.appendChild(placeholder)
    mogrts.forEach(function (item) {
      var option = document.createElement('option')
      option.value = item.file
      option.textContent = item.name + (item.folder && item.folder !== 'Motion Graphics Templates' ? ' · ' + item.folder : '')
      select.appendChild(option)
    })
    if (choice.mogrt && !mogrts.some(function (item) { return item.file === choice.mogrt })) choice.mogrt = ''
    select.value = choice.mogrt
  }

  // ---------- Estilo ao inserir ----------
  var textStyles = null

  function loadTextStyles() {
    if (textStyles === null) {
      textStyles = DEMO ? [{ name: 'Nuevabet 2', font: 'Portlin-Normal', family: 'Portlin' }] : engine.listTextStyles()
    }
    return textStyles
  }

  function savedStyle(id) {
    if (id.indexOf('saved:') !== 0) return null
    var name = id.slice(6)
    return loadTextStyles().filter(function (style) { return style.name === name })[0] || null
  }

  function styleLabel(id) {
    if (id === 'srtx') return 'SRTX'
    var saved = savedStyle(id)
    return saved ? saved.name : 'Sem estilo'
  }

  function renderStylePicker() {
    var select = $('caption-style')
    var choice = state.settings.captionStyle
    if (!select.options.length) {
      var options = [
        { value: 'none', label: 'Sem estilo (padrão do Premiere)' },
        { value: 'srtx', label: 'SRTX · 122, centro, meio da tela' }
      ].concat(loadTextStyles().map(function (style) {
        return { value: 'saved:' + style.name, label: style.name + (style.family ? ' · ' + style.family : '') + ' · 122' }
      }))
      options.forEach(function (item) {
        var option = document.createElement('option')
        option.value = item.value
        option.textContent = item.label
        select.appendChild(option)
      })
    }
    if (choice.id !== 'none' && choice.id !== 'srtx' && !savedStyle(choice.id)) choice.id = 'none'
    select.value = choice.id
    var graphic = choice.mode === 'graphic'
    Array.prototype.forEach.call($('caption-mode').children, function (button) {
      button.classList.toggle('is-on', button.getAttribute('data-value') === choice.mode)
    })
    $('mogrt-row').hidden = !graphic
    select.hidden = graphic
    if (graphic) {
      renderMogrtPicker(false)
      $('style-colors').hidden = true
      $('style-hint').textContent = choice.mogrt
        ? 'Cada legenda vira um clipe de texto com o estilo do modelo, na trilha de vídeo livre mais alta.'
        : 'Crie o modelo uma vez no Premiere: legenda no seu estilo (122, embaixo, meio) → botão direito no clipe → Export As Motion Graphics Template → Local Templates Folder. Depois clique em ↻.'
      return
    }
    var saved = savedStyle(choice.id)
    $('style-colors').hidden = !saved
    $('style-color').value = choice.color
    $('style-outline').value = choice.outline
    $('style-outline-width').value = choice.outlineWidth
    $('style-hint').textContent = choice.id === 'none'
      ? 'As legendas entram no padrão do Premiere.'
      : saved
        ? 'Fonte ' + (saved.family || 'do estilo') + ', 122, centralizada, embaixo e no meio. As cores do estilo não ficam no arquivo salvo: ajuste aqui.'
        : 'Tamanho 122, centralizada, alinhada embaixo, no meio da tela.'
  }

  function bindStylePicker() {
    var choice = function () { return state.settings.captionStyle }
    $('caption-mode').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-value]')
      if (!button || state.busy) return
      choice().mode = button.getAttribute('data-value')
      saveSettings()
      renderStylePicker()
    })
    $('caption-mogrt').addEventListener('change', function () {
      choice().mogrt = this.value
      saveSettings()
      renderStylePicker()
    })
    $('mogrt-refresh').addEventListener('click', function () {
      renderMogrtPicker(true)
      renderStylePicker()
    })
    $('caption-style').addEventListener('change', function () {
      choice().id = this.value
      saveSettings()
      renderStylePicker()
    })
    $('style-color').addEventListener('input', function () { choice().color = this.value; saveSettings() })
    $('style-outline').addEventListener('input', function () { choice().outline = this.value; saveSettings() })
    $('style-outline-width').addEventListener('input', function () {
      var value = Math.max(0, Math.min(40, Number(this.value) || 0))
      choice().outlineWidth = value
      saveSettings()
    })
  }

  // ---------- Etapa Texto ----------
  function autosize(area) {
    area.style.height = 'auto'
    area.style.height = area.scrollHeight + 2 + 'px'
  }

  function renderParagraphs() {
    var list = $('paragraphs')
    list.innerHTML = ''
    state.segments.forEach(function (segment, index) {
      var wrap = document.createElement('div')
      wrap.className = 'paragraph'
      var time = document.createElement('time')
      time.textContent = formatTime(segment.start + state.offset)
      var area = document.createElement('textarea')
      area.value = segment.text.trim()
      area.rows = 1
      area.spellcheck = false
      area.addEventListener('input', function () {
        state.segments[index].text = area.value
        if (state.captions.length) state.textChangedAfterCaptions = true
        autosize(area)
        renderFooter()
      })
      wrap.appendChild(time)
      wrap.appendChild(area)
      list.appendChild(wrap)
      requestAnimationFrame(function () { autosize(area) })
    })
  }

  function collectParagraphs() {
    return state.segments
      .map(function (segment) { return { text: segment.text.replace(/\s+/g, ' ').trim(), start: segment.start, end: segment.end } })
      .filter(function (segment) { return segment.text })
  }

  // ---------- Etapa Legendas ----------
  function renderCues() {
    state.offset = Number(state.offset) > 0 ? Number(state.offset) : 0
    var list = $('cues')
    list.innerHTML = ''
    var fragment = document.createDocumentFragment()
    state.captions.forEach(function (cue, index) {
      var li = document.createElement('li')
      li.className = 'cue' + (index === state.activeCue ? ' is-active' : '')

      var time = document.createElement('button')
      time.type = 'button'
      time.className = 'cue-time'
      time.textContent = formatTime(cue.start + state.offset)
      time.title = 'Ir para este ponto na timeline'
      time.addEventListener('click', function () {
        state.activeCue = index
        Array.prototype.forEach.call(list.children, function (row, i) { row.classList.toggle('is-active', i === index) })
        if (!DEMO) host.evalHost('srtx_setPlayhead', [cue.start + state.offset]).catch(function () {})
      })

      var input = document.createElement('input')
      input.className = 'cue-text'
      input.value = cue.text
      input.spellcheck = false

      var count = document.createElement('span')
      count.className = 'cue-count'
      var updateCount = function () {
        var text = input.value.trim()
        count.textContent = String(text.length)
        count.classList.toggle('warn', text.indexOf(' ') !== -1 && text.length > MAX_MULTI_WORD_CHARS)
      }
      input.addEventListener('input', function () {
        state.captions[index].text = input.value
        updateCount()
      })
      updateCount()

      li.appendChild(time)
      li.appendChild(input)
      li.appendChild(count)
      fragment.appendChild(li)
    })
    list.appendChild(fragment)
    $('cue-count').textContent = state.captions.length + (state.captions.length === 1 ? ' legenda' : ' legendas')
  }

  // ---------- Render geral ----------
  function renderTabs() {
    var available = { audio: true, texto: state.segments.length > 0, legendas: state.captions.length > 0, som: true }
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var name = tab.getAttribute('data-tab')
      tab.hidden = !available[name]
      tab.classList.toggle('is-active', name === state.tab)
      tab.disabled = state.busy
    })
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (view) {
      view.hidden = view.getAttribute('data-view') !== state.tab
    })
  }

  function renderSettings() {
    var s = state.settings
    Array.prototype.forEach.call($('range').children, function (b) { b.classList.toggle('is-on', b.getAttribute('data-value') === s.range) })
    Array.prototype.forEach.call($('words').children, function (b) {
      b.classList.toggle('is-on', Number(b.getAttribute('data-value')) === s.segmentation.target_words)
    })
    $('language').value = s.language
    $('model').value = s.model
    $('opt-prep').checked = s.segmentation.ignore_prepositions
    $('opt-punct').checked = s.segmentation.preserve_commas_periods
    $('opt-money').checked = s.segmentation.monetary_thousands
    var seq = state.sequence
    $('range-hint').textContent = s.range === 'inout' && seq
      ? 'Trecho de ' + formatTime(seq.inPoint) + ' a ' + formatTime(seq.outPoint) + '.'
      : seq ? 'Duração: ' + formatTime(seq.duration).slice(0, 5) + '. O áudio é renderizado pelo próprio Premiere.' : 'O áudio da timeline é renderizado pelo próprio Premiere.'
  }

  function renderFooter() {
    var primary = $('primary')
    var secondary = $('secondary')
    // A aba Som não usa o botão principal: cada som tem o próprio "inserir".
    document.querySelector('.cta-slot').hidden = state.tab === 'som'
    secondary.hidden = true
    primary.disabled = state.busy
    secondary.disabled = state.busy
    if (state.tab === 'audio') {
      primary.textContent = state.segments.length ? 'Transcrever de novo' : 'Transcrever sequência'
      primary.disabled = state.busy || !state.sequence
      if (state.segments.length) {
        secondary.hidden = false
        secondary.textContent = 'Voltar ao texto'
      }
    } else if (state.tab === 'texto') {
      primary.textContent = state.captions.length && !state.textChangedAfterCaptions ? 'Gerar legendas de novo' : 'Gerar legendas'
      if (state.captions.length) {
        secondary.hidden = false
        secondary.textContent = state.textChangedAfterCaptions ? 'Ver legendas (desatualizadas)' : 'Ver legendas'
      }
    } else {
      primary.textContent = 'Inserir na timeline'
    }
    var outdated = state.tab === 'legendas' && state.captions.length && !sameSegmentation(state.captionsSegmentation, state.settings.segmentation)
    $('regen').hidden = !outdated
    $('regen').disabled = state.busy
  }

  function render() {
    var seq = state.sequence
    $('seq-name').textContent = seq ? seq.name : 'Nenhuma sequência aberta'
    $('seq-dot').classList.toggle('on', !!seq)
    renderTabs()
    renderSettings()
    if (state.tab === 'legendas') {
      renderStylePicker()
      renderCues()
    }
    renderFooter()
  }

  // ---------- Eventos ----------
  function bindSegmented(id, apply) {
    $(id).addEventListener('click', function (event) {
      var button = event.target.closest('button[data-value]')
      if (!button || state.busy) return
      apply(button.getAttribute('data-value'))
      saveSettings()
      render()
    })
  }

  function bind() {
    $('seq').addEventListener('click', refreshSequence)
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () {
        if (state.busy) return
        var next = tab.getAttribute('data-tab')
        if (state.tab === 'som' && next !== 'som') window.SRTXLibrary.hide()
        state.tab = next
        notice(null)
        render()
        if (next === 'som') window.SRTXLibrary.show()
      })
    })
    bindSegmented('range', function (value) { state.settings.range = value })
    bindSegmented('words', function (value) { state.settings.segmentation.target_words = Number(value) })
    $('language').addEventListener('change', function () { state.settings.language = this.value; saveSettings() })
    $('model').addEventListener('change', function () { state.settings.model = this.value; saveSettings() })
    ;[['opt-prep', 'ignore_prepositions'], ['opt-punct', 'preserve_commas_periods'], ['opt-money', 'monetary_thousands']].forEach(function (pair) {
      $(pair[0]).addEventListener('change', function () {
        state.settings.segmentation[pair[1]] = this.checked
        saveSettings()
        renderFooter()
      })
    })
    $('primary').addEventListener('click', function () {
      if (state.busy) return
      if (state.tab === 'audio') transcribe()
      else if (state.tab === 'texto') generateCaptions()
      else insertCaptions()
    })
    $('secondary').addEventListener('click', function () {
      if (state.busy) return
      state.tab = state.tab === 'audio' ? 'texto' : 'legendas'
      render()
    })
    $('regen').addEventListener('click', regenerate)
    bindStylePicker()
    $('cancel').addEventListener('click', function () {
      if (!DEMO) engine.cancel()
    })
    window.addEventListener('focus', function () { if (!state.busy) refreshSequence() })
  }

  // ---------- Demonstração fora do Premiere ----------
  function demoTranscribe() {
    setBusy(true)
    startProgress(['Renderizar áudio da timeline', 'Carregar modelo', 'Transcrever'])
    var p = 0
    var timer = setInterval(function () {
      p += 0.2
      setStep(p < 0.4 ? 0 : p < 0.6 ? 1 : 2, p < 0.6 ? null : Math.min(1, (p - 0.6) * 2))
      if (p >= 1.2) {
        clearInterval(timer)
        state.segments = [
          { text: '¿Qué tal, gente? Hoy tenemos una partida muy especial.', start: 0.4, end: 3.9 },
          { text: '¿Verdad?', start: 4.1, end: 4.6 },
          { text: 'Sí, con 50 mil guaraníes de premio para el ganador.', start: 4.8, end: 8.2 }
        ]
        state.language = 'es'
        state.tab = 'texto'
        renderParagraphs()
        stopProgress()
        setBusy(false)
      }
    }, 300)
  }

  function demoCaptions() {
    var words = ['¿Qué', 'tal,', 'gente?', 'Hoy', 'tenemos', 'una', 'partida', 'muy', 'especial.', '¿Verdad?', 'Sí,', 'con', '50 mil', 'de', 'premio', 'para el', 'ganador.']
    state.captions = words.map(function (text, i) { return { text: text, start: 0.4 + i * 0.45, end: 0.4 + i * 0.45 + 0.42 } })
    state.words = state.captions
    state.captionsSegmentation = Object.assign({}, state.settings.segmentation)
    state.tab = 'legendas'
    render()
  }

  window.SRTXApp = { notice: notice }

  // ---------- Início ----------
  applyTheme()
  host.onThemeChange(applyTheme)
  bind()
  render()
  refreshSequence()
})()
