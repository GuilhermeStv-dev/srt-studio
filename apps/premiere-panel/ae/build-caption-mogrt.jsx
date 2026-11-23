/* SRTX — gera os modelos de legenda (.mogrt) no After Effects (D-028).
 * Modelos feitos no After Effects expõem o texto como campo editável para scripts
 * do Premiere; modelos feitos no Premiere não (o texto fica num binário que o
 * ExtendScript não consegue ler nem gravar).
 *
 * Rodar uma vez: After Effects > File > Scripts > Run Script File… (com
 * "Allow Scripts to Write Files and Access Network" ligado). Os modelos vão para a
 * pasta Local Templates do Premiere: "SRTX Legenda Vertical" e "SRTX Legenda Horizontal".
 * Resultado/erros: %TEMP%\srtx-mogrt-result.txt
 */
(function () {
  var STYLE = {
    font: 'Portlin-Normal',
    size: 122,
    fill: [254 / 255, 190 / 255, 0],
    stroke: [0, 0, 0],
    strokeWidth: 8
  };
  var FORMATS = [
    { name: 'SRTX Legenda Vertical', width: 1080, height: 1920 },
    { name: 'SRTX Legenda Horizontal', width: 1920, height: 1080 }
  ];
  var log = new File(Folder.temp.fsName + '/srtx-mogrt-result.txt');
  function report(text) {
    log.open('w');
    log.write(text);
    log.close();
  }

  function isOurProject() {
    for (var i = 1; i <= app.project.numItems; i++) {
      if (String(app.project.item(i).name).indexOf('SRTX Legenda') === 0) return true;
    }
    return false;
  }

  var steps = [];
  try {
    // Nunca descarta trabalho do usuário: só segue com projeto salvo, vazio ou do próprio SRTX.
    if (app.project && app.project.dirty && !isOurProject()) {
      report('ABORTADO: o After Effects tem alterações não salvas. Salve e rode de novo.');
      return;
    }
    var target = new Folder(Folder.userData.fsName + '/Adobe/Common/Motion Graphics Templates');
    if (!target.exists) target.create();

    app.beginSuppressDialogs();
    app.newProject();
    for (var i = 0; i < FORMATS.length; i++) {
      var format = FORMATS[i];
      steps.push(format.name + ': criando composição');
      var comp = app.project.items.addComp(format.name, format.width, format.height, 1, 120, 30);
      var layer = comp.layers.addText('Legenda');
      layer.name = 'Legenda';
      var source = layer.property('Source Text');
      var doc = source.value;
      doc.resetCharStyle();
      doc.resetParagraphStyle();
      doc.font = STYLE.font;
      doc.fontSize = STYLE.size;
      doc.applyFill = true;
      doc.fillColor = STYLE.fill;
      doc.applyStroke = true;
      doc.strokeColor = STYLE.stroke;
      doc.strokeWidth = STYLE.strokeWidth;
      doc.strokeOverFill = false;
      doc.justification = ParagraphJustification.CENTER_JUSTIFY;
      source.setValue(doc);
      // Âncora na linha de base, centro horizontal: o texto cresce para os lados e
      // fica "alinhado embaixo" na faixa do meio da tela (base a 2/3 da altura).
      layer.property('Anchor Point').setValue([0, 0]);
      layer.property('Position').setValue([format.width / 2, Math.round(format.height * 2 / 3)]);

      steps.push(format.name + ': expondo o texto no Essential Graphics');
      comp.openInEssentialGraphics();
      source.addToMotionGraphicsTemplateAs(comp, 'Legenda');
      comp.motionGraphicsTemplateName = format.name;

      steps.push(format.name + ': exportando');
      // O segundo argumento é a PASTA de destino; o nome do arquivo vem do nome do modelo.
      var ok = comp.exportAsMotionGraphicsTemplate(true, target.fsName);
      var file = new File(target.fsName + '/' + format.name + '.mogrt');
      steps.push(format.name + ': ' + (ok && file.exists ? 'OK ' + file.fsName : 'FALHOU (export devolveu ' + ok + ')'));
    }
    var aep = new File(Folder.myDocuments.fsName + '/SRTX/SRTX Legenda.aep');
    if (!aep.parent.exists) aep.parent.create();
    app.project.save(aep);
    steps.push('Projeto salvo em ' + aep.fsName);
    app.endSuppressDialogs(false);
    report(steps.join('\n'));
  } catch (error) {
    try { app.endSuppressDialogs(false); } catch (ignored) {}
    steps.push('ERRO: ' + error.toString() + ' (linha ' + error.line + ')');
    report(steps.join('\n'));
  }
})();
