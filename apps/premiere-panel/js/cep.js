/* Ponte mínima com o runtime CEP do Premiere (o que o CSInterface da Adobe embrulha).
 * Fora do Premiere (abrindo o index.html no navegador) tudo vira modo de demonstração. */
(function () {
  'use strict'

  var cep = window.__adobe_cep__ || null

  function nodeRequire(name) {
    if (window.cep_node && window.cep_node.require) return window.cep_node.require(name)
    if (typeof window.require === 'function') return window.require(name)
    return null
  }

  function evalHost(fn, args) {
    var call = fn + '(' + (args || []).map(function (arg) { return JSON.stringify(arg) }).join(',') + ')'
    return new Promise(function (resolve, reject) {
      if (!cep) return reject(new Error('Abra o painel dentro do Premiere'))
      cep.evalScript(call, function (raw) {
        var payload
        try {
          payload = JSON.parse(raw)
        } catch (error) {
          return reject(new Error(raw === 'EvalScript error.' ? 'Erro no script do Premiere (' + fn + ')' : String(raw)))
        }
        if (!payload || payload.ok === false) return reject(new Error((payload && payload.error) || 'Falha no Premiere'))
        resolve(payload)
      })
    })
  }

  function extensionPath() {
    if (!cep) return ''
    var raw = cep.getSystemPath('extension')
    var decoded = decodeURI(raw).replace(/^file:\/{2,3}/, '')
    return navigator.platform.indexOf('Win') === 0 ? decoded.replace(/\//g, '\\') : '/' + decoded.replace(/^\/+/, '')
  }

  function hostSkin() {
    if (!cep) return null
    try {
      var env = JSON.parse(cep.getHostEnvironment())
      return env && env.appSkinInfo ? env.appSkinInfo : null
    } catch (error) {
      return null
    }
  }

  function onThemeChange(handler) {
    if (cep && cep.addEventListener) cep.addEventListener('com.adobe.csxs.events.ThemeColorChanged', handler)
  }

  window.SRTXHost = {
    available: !!cep,
    nodeRequire: nodeRequire,
    evalHost: evalHost,
    extensionPath: extensionPath,
    hostSkin: hostSkin,
    onThemeChange: onThemeChange
  }
})()
