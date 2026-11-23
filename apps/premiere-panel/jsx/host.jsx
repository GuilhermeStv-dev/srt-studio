/* SRTX — lado ExtendScript do painel (D-021).
 * Só conversa com o Premiere: informações da sequência, exportar áudio,
 * importar o SRT como trilha de legendas e mover a agulha.
 * Toda função devolve uma string JSON: {"ok":true,...} ou {"ok":false,"error":"..."}.
 */

var SRTX_TICKS_PER_SECOND = 254016000000;

function srtx_quote(value) {
  var text = String(value);
  var out = '"';
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    var code = text.charCodeAt(i);
    if (c === '"' || c === '\\') out += '\\' + c;
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (code < 32) out += '\\u' + ('0000' + code.toString(16)).slice(-4);
    else out += c;
  }
  return out + '"';
}

// ExtendScript do Premiere não tem JSON nativo: serializador mínimo.
function srtx_json(value) {
  if (value === null || value === undefined) return 'null';
  var type = typeof value;
  if (type === 'number') return isFinite(value) ? String(value) : 'null';
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'string') return srtx_quote(value);
  if (value instanceof Array) {
    var items = [];
    for (var i = 0; i < value.length; i++) items.push(srtx_json(value[i]));
    return '[' + items.join(',') + ']';
  }
  var parts = [];
  for (var key in value) {
    if (value.hasOwnProperty(key)) parts.push(srtx_quote(key) + ':' + srtx_json(value[key]));
  }
  return '{' + parts.join(',') + '}';
}

function srtx_fail(error) {
  return srtx_json({ ok: false, error: String(error && error.message ? error.message : error) });
}

function srtx_seconds(time) {
  if (!time) return 0;
  if (time.seconds !== undefined) return Number(time.seconds);
  return Number(time.ticks) / SRTX_TICKS_PER_SECOND;
}

function srtx_projectFolder() {
  var projectPath = app.project && app.project.path ? String(app.project.path) : '';
  if (!projectPath) return '';
  var file = new File(projectPath);
  return file.parent ? file.parent.fsName : '';
}

function srtx_sequenceInfo() {
  try {
    var seq = app.project ? app.project.activeSequence : null;
    if (!seq) return srtx_json({ ok: true, sequence: null });
    var inPoint = srtx_seconds(seq.getInPointAsTime ? seq.getInPointAsTime() : null);
    var outPoint = srtx_seconds(seq.getOutPointAsTime ? seq.getOutPointAsTime() : null);
    var duration = srtx_seconds(seq.end);
    // In/Out não definidos voltam como valores de sentinela: normaliza para a sequência inteira.
    if (!(inPoint >= 0) || !(outPoint > inPoint)) {
      inPoint = 0;
      outPoint = duration;
    }
    return srtx_json({
      ok: true,
      sequence: {
        id: String(seq.sequenceID),
        name: String(seq.name),
        duration: duration,
        inPoint: inPoint,
        outPoint: outPoint,
        width: Number(seq.frameSizeHorizontal) || 1920,
        height: Number(seq.frameSizeVertical) || 1080
      },
      projectFolder: srtx_projectFolder(),
      appPath: String(app.path)
    });
  } catch (error) {
    return srtx_fail(error);
  }
}

// Renderiza o áudio da sequência ativa num WAV, de forma síncrona.
// range: "all" (sequência inteira) ou "inout" (entre In e Out).
function srtx_exportAudio(outputPath, presetPath, range) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return srtx_fail('Nenhuma sequência aberta');
    var preset = new File(presetPath);
    if (!preset.exists) return srtx_fail('Preset de áudio não encontrado: ' + presetPath);
    // 0 = sequência inteira, 1 = de In até Out. Sem In/Out definidos o Premiere
    // devolve um valor de "não definido" (~ -360000 s): aí vale a sequência inteira.
    var inPoint = srtx_seconds(seq.getInPointAsTime());
    var outPoint = srtx_seconds(seq.getOutPointAsTime());
    var validRange = range === 'inout' && inPoint >= 0 && outPoint > inPoint;
    var workArea = validRange ? 1 : 0;
    var offset = validRange ? inPoint : 0;
    var result = seq.exportAsMediaDirect(outputPath, preset.fsName, workArea);
    var output = new File(outputPath);
    if (!output.exists) return srtx_fail('O Premiere não gerou o áudio (' + result + ')');
    return srtx_json({ ok: true, path: output.fsName, offset: offset });
  } catch (error) {
    return srtx_fail(error);
  }
}

function srtx_findBin(name) {
  var root = app.project.rootItem;
  for (var i = 0; i < root.children.numItems; i++) {
    var child = root.children[i];
    if (child && child.type === ProjectItemType.BIN && child.name === name) return child;
  }
  return root.createBin(name);
}

function srtx_findImported(bin, srtPath) {
  var wanted = new File(srtPath).fsName.toLowerCase();
  for (var i = bin.children.numItems - 1; i >= 0; i--) {
    var item = bin.children[i];
    try {
      if (item && item.getMediaPath && String(new File(item.getMediaPath()).fsName).toLowerCase() === wanted) return item;
    } catch (ignored) {}
  }
  return null;
}

// Importa o SRT gerado pelo engine e cria a trilha de legendas na sequência ativa.
function srtx_insertCaptions(srtPath, startSeconds) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return srtx_fail('Nenhuma sequência aberta');
    var bin = srtx_findBin('SRTX Legendas');
    var imported = app.project.importFiles([srtPath], true, bin, false);
    if (!imported) return srtx_fail('O Premiere recusou o arquivo de legendas');
    var item = srtx_findImported(bin, srtPath);
    if (!item) return srtx_fail('Arquivo importado, mas não encontrado no projeto');
    var format = typeof Sequence !== 'undefined' && Sequence.CAPTION_FORMAT_SUBTITLE !== undefined
      ? Sequence.CAPTION_FORMAT_SUBTITLE
      : undefined;
    var created = format === undefined
      ? seq.createCaptionTrack(item, Number(startSeconds) || 0)
      : seq.createCaptionTrack(item, Number(startSeconds) || 0, format);
    if (created === false) return srtx_fail('Não foi possível criar a trilha de legendas');
    return srtx_json({ ok: true, item: String(item.name) });
  } catch (error) {
    return srtx_fail(error);
  }
}

// ---------- Legendas como clipes de texto (MOGRT) — D-028 ----------

function srtx_parse(text) {
  // ExtendScript não tem JSON.parse. Antes do eval, a validação do json2.js garante
  // que o texto é só JSON (strings, números, true/false/null, [], {}), nunca código.
  // Os textos vêm do próprio painel (JSON.stringify) ou do parâmetro do MOGRT.
  var source = String(text);
  var cleaned = source
    .replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
    .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
    .replace(/(?:^|:|,)(?:\s*\[)+/g, '');
  if (!/^[\],:{}\s]*$/.test(cleaned)) throw new Error('Dados inválidos para o Premiere');
  return eval('(' + source + ')');
}

function srtx_videoTrackFree(track, from, to) {
  for (var i = 0; i < track.clips.numItems; i++) {
    var clip = track.clips[i];
    if (srtx_seconds(clip.start) < to && srtx_seconds(clip.end) > from) return false;
  }
  return true;
}

// Escolhe a trilha de vídeo para as legendas: a mais alta livre em todo o trecho;
// se nenhuma estiver livre, cria uma trilha nova no topo.
function srtx_prepareGraphicTrack(from, to) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return srtx_fail('Nenhuma sequência aberta');
    for (var t = seq.videoTracks.numTracks - 1; t >= 1; t--) {
      var track = seq.videoTracks[t];
      if (!track.isLocked() && srtx_videoTrackFree(track, Number(from), Number(to))) {
        return srtx_json({ ok: true, track: t });
      }
    }
    app.enableQE();
    var before = seq.videoTracks.numTracks;
    qe.project.getActiveSequence().addTracks(1, before, 0);
    if (seq.videoTracks.numTracks <= before) return srtx_fail('Não consegui criar uma trilha de vídeo. Crie uma vazia acima do vídeo e tente de novo.');
    return srtx_json({ ok: true, track: seq.videoTracks.numTracks - 1, created: true });
  } catch (error) {
    return srtx_fail(error);
  }
}

// Troca o texto de um clipe de modelo feito no After Effects: o campo de texto
// exposto vem como JSON com "textEditValue" (e o estilo junto, que fica intacto).
// Modelos feitos no Premiere não têm esse campo (getMGTComponent devolve null).
function srtx_setMogrtText(clip, text) {
  var component = clip.getMGTComponent();
  if (!component) return false;
  var chosen = null;
  for (var i = 0; i < component.properties.numItems; i++) {
    var param = component.properties[i];
    var value;
    try { value = param.getValue(); } catch (ignored) { continue; }
    if (typeof value !== 'string' || value.indexOf('textEditValue') === -1) continue;
    if (!chosen || param.displayName === 'Legenda') chosen = { param: param, value: value };
    if (param.displayName === 'Legenda') break;
  }
  if (!chosen) return false;
  var parsed = srtx_parse(chosen.value);
  parsed.textEditValue = text;
  return chosen.param.setValue(srtx_json(parsed), true) !== false;
}

// Insere um lote de legendas: [{t: texto, s: início, e: fim}] em segundos de sequência.
function srtx_insertGraphicCaptions(mogrtPath, captionsJson, trackIndex) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return srtx_fail('Nenhuma sequência aberta');
    var file = new File(mogrtPath);
    if (!file.exists) return srtx_fail('Modelo não encontrado: ' + mogrtPath);
    var captions = srtx_parse(captionsJson);
    var track = Number(trackIndex);
    var inserted = 0;
    var textFailed = 0;
    for (var i = 0; i < captions.length; i++) {
      var cue = captions[i];
      var ticks = String(Math.round(Number(cue.s) * SRTX_TICKS_PER_SECOND));
      var clip = seq.importMGT(file.fsName, ticks, track, 0);
      if (!clip) continue;
      inserted++;
      try {
        var end = new Time();
        end.seconds = Number(cue.e);
        clip.end = end;
      } catch (ignored) {}
      if (!srtx_setMogrtText(clip, String(cue.t))) textFailed++;
    }
    return srtx_json({ ok: true, inserted: inserted, textFailed: textFailed });
  } catch (error) {
    return srtx_fail(error);
  }
}

// ---------- Sound design: inserir efeito/música na agulha ----------

function srtx_audioTrackCount() {
  try {
    var seq = app.project.activeSequence;
    return srtx_json({ ok: true, count: seq ? seq.audioTracks.numTracks : 0 });
  } catch (error) {
    return srtx_fail(error);
  }
}

function srtx_trackIsFree(track, from, to) {
  for (var i = 0; i < track.clips.numItems; i++) {
    var clip = track.clips[i];
    if (srtx_seconds(clip.start) < to && srtx_seconds(clip.end) > from) return false;
  }
  return true;
}

// Coloca o som na agulha sem empurrar nada (overwrite), na trilha escolhida ou na
// primeira trilha de áudio livre durante a duração do som (trackIndex = -1).
function srtx_insertSound(path, trackIndex, duration) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return srtx_fail('Nenhuma sequência aberta');
    var file = new File(path);
    if (!file.exists) return srtx_fail('Arquivo não encontrado: ' + path);
    var bin = srtx_findBin('SRTX Sound');
    var item = srtx_findImported(bin, path);
    if (!item) {
      app.project.importFiles([file.fsName], true, bin, false);
      item = srtx_findImported(bin, path);
    }
    if (!item) return srtx_fail('Não foi possível importar o som');

    var at = srtx_seconds(seq.getPlayerPosition());
    var length = Math.max(0.1, Number(duration) || 1);
    var index = Number(trackIndex);
    if (index < 0) {
      index = -1;
      for (var t = 0; t < seq.audioTracks.numTracks; t++) {
        var candidate = seq.audioTracks[t];
        if (!candidate.isLocked() && srtx_trackIsFree(candidate, at, at + length)) {
          index = t;
          break;
        }
      }
      if (index < 0) return srtx_fail('Nenhuma trilha de áudio livre na agulha. Crie uma trilha ou escolha uma no seletor.');
    }
    if (index >= seq.audioTracks.numTracks) return srtx_fail('A trilha A' + (index + 1) + ' não existe nesta sequência');
    var track = seq.audioTracks[index];
    if (track.isLocked()) return srtx_fail('A trilha A' + (index + 1) + ' está travada');
    track.overwriteClip(item, at);
    return srtx_json({ ok: true, track: index + 1, at: at, name: String(item.name) });
  } catch (error) {
    return srtx_fail(error);
  }
}

function srtx_setPlayhead(seconds) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return srtx_fail('Nenhuma sequência aberta');
    var ticks = Math.round(Number(seconds) * SRTX_TICKS_PER_SECOND);
    seq.setPlayerPosition(String(ticks));
    return srtx_json({ ok: true });
  } catch (error) {
    return srtx_fail(error);
  }
}
