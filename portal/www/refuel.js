/* Refuel · Token Refill entry: opens an in-page explainer. No network requests, no navigation
 * until the user presses the primary button (same app URL the Chat entry uses).
 * All copy for this feature is English only, in every page language (see lang="en" in index.html).
 * The flow is not live yet, hence the "Available soon" badge. */
(function () {
  'use strict';
  /* Fill these in once the Refuel MCP exists. Leave '' until then: the modal shows
   * "available at launch" and nothing is invented. Links must be https://. */
  var REFUEL_MCP = { url: '', docsUrl: '' };

  var APP_URL = 'https://app.x-connect.ai/'; // same target as the Chat entry in portal.js (XC_APP)
  var $ = function (id) { return document.getElementById(id); };
  var fab, modal, closeBtn, xBtn, cta, lastFocus;

  function isHttps(u) { return typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u); }

  function renderMcp() {
    var box = $('refuel-mcp-body');
    box.textContent = '';
    var hasUrl = isHttps(REFUEL_MCP.url), hasDocs = isHttps(REFUEL_MCP.docsUrl);
    if (!hasUrl && !hasDocs) {
      var p = document.createElement('p');
      p.className = 'rf-mcp-soon';
      p.textContent = 'MCP endpoint and setup guide: available at launch';
      box.appendChild(p);
      return;
    }
    if (hasUrl) {
      var row = document.createElement('p');
      row.className = 'rf-mcp-row';
      var k = document.createElement('span'); k.textContent = 'MCP server URL';
      var c = document.createElement('code'); c.textContent = REFUEL_MCP.url;
      row.appendChild(k); row.appendChild(c); box.appendChild(row);
    }
    if (hasDocs) {
      var row2 = document.createElement('p');
      row2.className = 'rf-mcp-row';
      var a = document.createElement('a');
      a.href = REFUEL_MCP.docsUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = 'Setup guide';
      row2.appendChild(a); box.appendChild(row2);
    }
  }
  function open() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    fab.setAttribute('aria-expanded', 'true');
    cta.focus();
  }
  function close() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.documentElement.style.overflow = '';
    fab.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) lastFocus.focus(); else fab.focus();
  }
  function init() {
    fab = $('refuel-fab'); modal = $('refuel-modal');
    if (!fab || !modal) return;
    closeBtn = $('refuel-close'); xBtn = $('refuel-x'); cta = $('refuel-cta');
    cta.setAttribute('href', APP_URL);
    renderMcp();
    fab.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    xBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') { // keep focus inside the dialog
        var f = [xBtn, cta, closeBtn];
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
