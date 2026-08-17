(function () {
  "use strict";

  var marker = window.location.search + "&" + window.location.hash;
  var enabled = /(^|[?&#])embed=miniapp([&]|$)/i.test(marker);
  var startedAt = Date.now();
  var minVisibleMs = 2600;
  var maxVisibleMs = 30000;
  var previewClosed = false;
  var readySince = 0;
  var loadingRemoved = false;
  var loadingInstallTimer = null;
  var initialDocumentTitle = (document.title || "").replace(/\s+/g, " ").trim();
  var miniappTitleFallback = getMiniappTitleFallback();

  function getMiniappTitleFallback() {
    var match = marker.match(/(?:^|[?&#])(?:miniapp_title|miniappTitle|webviewTitle)=([^&#]*)/i);
    if (!match) return initialDocumentTitle || "\u79ef\u67283D\u56fe\u7eb8 MOC\u56fe\u7eb8";

    try {
      return decodeURIComponent(match[1].replace(/\+/g, "%20")) || initialDocumentTitle || "\u79ef\u67283D\u56fe\u7eb8 MOC\u56fe\u7eb8";
    } catch (error) {
      return initialDocumentTitle || "\u79ef\u67283D\u56fe\u7eb8 MOC\u56fe\u7eb8";
    }
  }

  function keepMiniappTitle() {
    var modelTitle = document.getElementById("modelTitle");
    var titleText = modelTitle && (modelTitle.textContent || modelTitle.innerText || "").replace(/\s+/g, " ").trim();
    var nextTitle = titleText || miniappTitleFallback;
    if (document.title !== nextTitle) document.title = nextTitle;
  }

  function clearSavedSteps() {
    try {
      for (var i = window.localStorage.length - 1; i >= 0; i -= 1) {
        var key = window.localStorage.key(i);
        if (/^last_step_/i.test(key || "")) {
          window.localStorage.removeItem(key);
        }
      }
    } catch (error) {}
  }

  function preventSavedSteps() {
    if (!window.localStorage || window.__miniappFootechsStepGuard) return;

    var storageProto = (window.Storage && window.Storage.prototype) || Object.getPrototypeOf(window.localStorage);
    var originalGetItem = storageProto.getItem;
    var originalSetItem = storageProto.setItem;
    var originalRemoveItem = storageProto.removeItem;

    storageProto.getItem = function (key) {
      if (this === window.localStorage && /^last_step_/i.test(String(key || ""))) return null;
      return originalGetItem.apply(this, arguments);
    };
    storageProto.setItem = function (key, value) {
      if (this === window.localStorage && /^last_step_/i.test(String(key || ""))) {
        originalRemoveItem.call(this, key);
        return;
      }
      return originalSetItem.apply(this, arguments);
    };

    try {
      Object.defineProperty(window, "__miniappFootechsStepGuard", {
        configurable: true,
        value: true
      });
    } catch (error) {}

    clearSavedSteps();
  }

  function hideElement(element) {
    if (!element) return;
    element.setAttribute("data-miniapp-footechs-back", "true");
    element.style.setProperty("display", "none", "important");
    element.style.setProperty("pointer-events", "none", "important");
  }

  function hideBackButtons(root) {
    var scope = root && root.querySelectorAll ? root : document;
    if (
      root &&
      root.tagName &&
      root.tagName.toLowerCase() === "img" &&
      /back\.png/i.test(root.getAttribute("src") || "")
    ) {
      hideElement(root.closest("a,button") || root.parentElement || root);
    }

    var icons = scope.querySelectorAll(
      'img[src*="back.png"], img[src*="back.PNG"], [style*="back.png"], [style*="back.PNG"]'
    );
    for (var i = 0; i < icons.length; i += 1) {
      hideElement(icons[i].closest("a,button") || icons[i].parentElement || icons[i]);
    }

    var knownBackButton = document.getElementById("tBack");
    hideElement(knownBackButton);
  }

  function keepModelVisible() {
    if (syncPartsListState()) return;

    var mainHolder = document.getElementById("main_canvas_holder");
    var optionsPanel = document.getElementById("options2");
    if (optionsPanel) {
      optionsPanel.classList.remove("open");
      optionsPanel.style.setProperty("display", "none", "important");
    }

    restoreMainCanvas(mainHolder);
  }

  function restoreMainCanvas(mainHolder) {
    if (!mainHolder) mainHolder = document.getElementById("main_canvas_holder");
    if (!mainHolder) return;

    mainHolder.classList.remove("close");
    mainHolder.style.removeProperty("pointer-events");
    mainHolder.style.removeProperty("display");
  }

  function syncPartsListState() {
    var partsList = document.getElementById("partslist");
    var mainHolder = document.getElementById("main_canvas_holder");
    restoreMainCanvas(mainHolder);

    if (partsList && partsList.classList.contains("open")) {
      return true;
    }

    return false;
  }

  var closePreviewTimer = null;
  var loadingElement = null;

  function installLoadingOverlayStyle() {
    if (!document.head || document.getElementById("miniappFootechsLoadingStyle")) return;
    var style = document.createElement("style");
    style.id = "miniappFootechsLoadingStyle";
    style.textContent =
      'html.miniapp-footechs, html.miniapp-footechs body { width: 100% !important; height: 100% !important; min-height: 100% !important; margin: 0 !important; } ' +
      'html.miniapp-footechs body { background: #fff !important; } ' +
      'html.miniapp-footechs .miniapp-loading { position: fixed !important; inset: 0 !important; z-index: 99999 !important; display: flex !important; width: auto !important; height: auto !important; min-width: 100vw !important; min-height: 100vh !important; min-height: 100dvh !important; align-items: center !important; justify-content: center !important; background: rgba(241, 241, 241, 0.96); color: #2b3542; font: 500 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; pointer-events: auto; transition: opacity 0.18s ease, visibility 0.18s ease; } ' +
      'html.miniapp-footechs .miniapp-loading::before { content: ""; position: fixed; inset: 0; background: rgba(241, 241, 241, 0.96); } ' +
      'html.miniapp-footechs .miniapp-loading.is-leaving { opacity: 0; visibility: hidden; } ' +
      'html.miniapp-footechs .miniapp-loading-box { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 8px; background: rgba(255, 255, 255, 0.9); box-shadow: 0 8px 24px rgba(18, 32, 48, 0.08); } ' +
      'html.miniapp-footechs .miniapp-loading-spinner { width: 18px; height: 18px; border: 2px solid rgba(30, 145, 220, 0.18); border-top-color: #1e91dc; border-radius: 50%; animation: miniapp-loading-spin 0.72s linear infinite; } ' +
      '@supports (-webkit-touch-callout: none) { html.miniapp-footechs .miniapp-loading { min-height: -webkit-fill-available !important; } } ' +
      '@keyframes miniapp-loading-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  function isShown(element) {
    if (!element) return false;
    var style = window.getComputedStyle ? window.getComputedStyle(element) : element.style;
    return style && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function hidePliPreviewLayer() {
    var previewHolder = document.getElementById("preview_holder");
    var previewBackground = document.getElementById("preview_background");
    var originalLoading = document.getElementById("loading");
    var originalRendererLoading = document.getElementById("xuanran");

    if (previewHolder) {
      previewHolder.style.display = "none";
      previewHolder.style.removeProperty("pointer-events");
    }
    if (previewBackground) {
      previewBackground.style.display = "none";
      previewBackground.style.removeProperty("pointer-events");
    }
    if (originalLoading) {
      originalLoading.style.setProperty("display", "none", "important");
      originalLoading.style.setProperty("pointer-events", "none", "important");
    }
    if (originalRendererLoading) {
      originalRendererLoading.style.setProperty("display", "none", "important");
      originalRendererLoading.style.setProperty("pointer-events", "none", "important");
    }
    keepModelVisible();
  }

  function restorePliPreviewInteractivity() {
    var previewHolder = document.getElementById("preview_holder");
    if (!isShown(previewHolder)) return;

    [
      previewHolder,
      document.getElementById("preview_background"),
      document.getElementById("preview_parent"),
      document.getElementById("secondary_canvas"),
      document.getElementById("preview_info"),
      document.getElementById("pli_preview_close"),
      document.getElementById("pli_preview_closeButton"),
      document.getElementById("pli_preview_triButton")
    ].forEach(function (element) {
      if (element) element.style.removeProperty("pointer-events");
    });
  }

  function installLoadingOverlay() {
    installLoadingOverlayStyle();
    if (loadingElement || !document.body) return loadingElement;

    var existingLoading = document.getElementById("miniappFootechsLoading");
    if (existingLoading) {
      loadingElement = existingLoading;
      loadingElement.style.removeProperty("display");
      loadingElement.classList.remove("is-leaving");
      return loadingElement;
    }

    loadingElement = document.createElement("div");
    loadingElement.id = "miniappFootechsLoading";
    loadingElement.className = "miniapp-loading";
    loadingElement.setAttribute("aria-live", "polite");
    loadingElement.innerHTML =
      '<div class="miniapp-loading-box">' +
      '<span class="miniapp-loading-spinner" aria-hidden="true"></span>' +
      '<span>\u9875\u9762\u52a0\u8f7d\u4e2d</span>' +
      "</div>";
    document.body.appendChild(loadingElement);
    return loadingElement;
  }

  function installLoadingOverlayWhenPossible() {
    installLoadingOverlay();
    if (loadingElement || loadingInstallTimer) return;
    loadingInstallTimer = window.setInterval(function () {
      installLoadingOverlay();
      if (loadingElement || document.readyState === "complete") {
        window.clearInterval(loadingInstallTimer);
        loadingInstallTimer = null;
      }
    }, 16);
  }

  function removeLoadingOverlay() {
    if (loadingRemoved) return;
    var loading = loadingElement || document.getElementById("miniappFootechsLoading");
    if (!loading) return;
    loadingRemoved = true;
    loading.classList.add("is-leaving");
    window.setTimeout(function () {
      if (loading.parentNode) loading.parentNode.removeChild(loading);
    }, 220);
  }

  function canShowMainViewer() {
    if (!previewClosed) return false;
    var mainCanvas = document.getElementById("main_canvas");
    var cameraButtons = document.getElementById("camera_buttons");
    return !!mainCanvas && !!cameraButtons;
  }

  function isPliPreviewReadyToClose() {
    var triButton = document.getElementById("pli_preview_triButton");
    if (!isShown(triButton)) return false;
    var style = window.getComputedStyle ? window.getComputedStyle(triButton) : triButton.style;
    return style && style.display === "block";
  }

  function tryRemoveLoadingOverlay() {
    var now = Date.now();
    var timedOut = now - startedAt > maxVisibleMs;
    if (canShowMainViewer()) {
      if (!readySince) readySince = now;
      var stayedLongEnough = now - startedAt >= minVisibleMs;
      var readyStable = now - readySince >= 500;
      if (stayedLongEnough && readyStable) {
        removeLoadingOverlay();
        return true;
      }
    } else {
      readySince = 0;
    }
    if (timedOut && !previewClosed) {
      var loading = loadingElement || document.getElementById("miniappFootechsLoading");
      if (loading) loading.setAttribute("data-miniapp-waiting-preview", "true");
    }
    return false;
  }

  function requestHidePliPreview() {
    if (previewClosed || closePreviewTimer) return;
    closePreviewTimer = window.setTimeout(function () {
      closePreviewTimer = null;
      if (
        isPliPreviewReadyToClose() &&
        window.manager &&
        typeof window.manager.hidePliPreview === "function"
      ) {
        try {
          window.manager.hidePliPreview.call(window.manager);
          previewClosed = true;
        } catch (error) {
          previewClosed = false;
        }
      }

      if (previewClosed) {
        hidePliPreviewLayer();
        window.setTimeout(hidePliPreviewLayer, 80);
        window.setTimeout(hidePliPreviewLayer, 240);
      }
      tryRemoveLoadingOverlay();
    }, 180);
  }

  function triggerOptionChoice(element) {
    if (!element) return;
    keepModelVisible();

    try {
      var quietClick = new MouseEvent("click", {
        bubbles: false,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(quietClick);
    } catch (error) {
      element.click();
    }

    if (!element.classList.contains("option_selected")) {
      element.click();
    }

    window.setTimeout(keepModelVisible, 0);
    window.setTimeout(keepModelVisible, 80);
  }

  function getOptionGroupContext(group) {
    var chunks = [];
    var node = group;
    for (var depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      chunks.push(node.className || "");
      chunks.push(node.id || "");
      if (depth === 0) chunks.push(node.textContent || "");
    }

    var sibling = group.previousElementSibling;
    for (var i = 0; sibling && i < 4; i += 1, sibling = sibling.previousElementSibling) {
      chunks.push(sibling.className || "");
      chunks.push(sibling.id || "");
      chunks.push(sibling.textContent || "");
    }

    return chunks.join(" ").replace(/\s+/g, " ");
  }

  function findDisplayModeOptionsGroup() {
    var groups = document.querySelectorAll(".options_group");
    for (var i = 0; i < groups.length; i += 1) {
      var context = getOptionGroupContext(groups[i]);
      if (/showOldColors|\u65b0\u65e7|\u65e7\u79ef\u6728|\u79ef\u6728\u5757\u663e\u793a|\u663e\u793a\u6a21\u5f0f/i.test(context)) {
        return groups[i];
      }
    }
    return null;
  }

  function syncDisplayModeOptionsGroup(value) {
    var group = findDisplayModeOptionsGroup();
    if (!group) return;

    var choices = group.querySelectorAll(".option, .option_selected");
    var selectedIndex = parseInt(value, 10) === 3 ? 1 : 0;
    for (var i = 0; i < choices.length; i += 1) {
      choices[i].classList.remove("option", "option_selected");
      choices[i].classList.add(i === selectedIndex ? "option_selected" : "option");
    }
  }

  function requestViewerRender() {
    var manager = window.manager;
    [
      "render",
      "draw",
      "redraw",
      "update",
      "animate",
      "requestRender"
    ].forEach(function (name) {
      if (manager && typeof manager[name] === "function") {
        try {
          manager[name].call(manager);
        } catch (error) {}
      }
    });
  }

  function getStepInputValue(manager) {
    var input =
      manager &&
      manager.options &&
      manager.options.stepInput2;
    var value = input && parseInt(input.value, 10);
    return isNaN(value) ? null : value;
  }

  function captureDisplayModeState() {
    var manager = window.manager;
    return {
      stepInputValue: getStepInputValue(manager),
      viewMainFlag: !!(manager && manager.viewMainFlag),
      partsListOpen: !!(
        document.getElementById("partslist") &&
        document.getElementById("partslist").classList.contains("open")
      )
    };
  }

  function restoreDisplayModeState(snapshot) {
    var manager = window.manager;
    var optionsPanel = document.getElementById("options2");

    if (optionsPanel) {
      optionsPanel.classList.remove("open");
      optionsPanel.style.setProperty("display", "none", "important");
      optionsPanel.style.setProperty("pointer-events", "none", "important");
    }

    var currentStepValue = getStepInputValue(manager);
    if (
      manager &&
      snapshot &&
      snapshot.stepInputValue !== null &&
      currentStepValue !== null &&
      currentStepValue !== snapshot.stepInputValue &&
      typeof manager.goToStep === "function"
    ) {
      try {
        manager.goToStep(snapshot.stepInputValue);
      } catch (error) {}
    }

    if (previewClosed) hidePliPreviewLayer();
    if (!snapshot || !snapshot.partsListOpen) keepModelVisible();
    requestViewerRender();
  }

  function runNativeDisplayModeChange(options, next) {
    var manager = window.manager;
    var originalOptions2 = manager && manager.options2;

    if (manager && typeof originalOptions2 === "function") {
      manager.options2 = function () {};
    }

    try {
      options.onChange(false, "showOldColors", next);
    } finally {
      if (manager && typeof originalOptions2 === "function") {
        manager.options2 = originalOptions2;
      }
    }
  }

  function restoreDisplayModeStateSoon(snapshot) {
    restoreDisplayModeState(snapshot);
    [0, 60, 160, 320].forEach(function (delay) {
      window.setTimeout(function () {
        restoreDisplayModeState(snapshot);
      }, delay);
    });
  }

  function toggleDisplayModeOption() {
    var options = window.MOC && window.MOC.Options;
    if (!options || typeof options.showOldColors === "undefined") {
      return false;
    }

    var snapshot = captureDisplayModeState();
    var current = parseInt(options.showOldColors, 10);
    var next = current === 3 ? 4 : 3;
    options.showOldColors = next;

    try {
      window.localStorage.setItem("showOldColors", String(next));
    } catch (error) {}

    syncDisplayModeOptionsGroup(next);
    if (typeof options.onChange === "function") {
      try {
        runNativeDisplayModeChange(options, next);
      } catch (error) {}
    }
    restoreDisplayModeStateSoon(snapshot);
    return true;
  }

  function replaceZoomOutWithOptions() {
    var zoomOutButton = document.getElementById("zoom_out_button_large");
    var optionsButton = document.getElementById("optionsButton");
    if (!optionsButton || document.getElementById("miniappOptionsToggle")) return;

    var host = (zoomOutButton && zoomOutButton.parentElement) || optionsButton.parentElement;
    if (!host) return;

    optionsButton.setAttribute("data-miniapp-footechs-original-options", "true");
    optionsButton.style.setProperty("display", "none", "important");
    optionsButton.style.setProperty("pointer-events", "none", "important");

    if (zoomOutButton) {
      zoomOutButton.setAttribute("data-miniapp-footechs-hidden-control", "true");
      zoomOutButton.style.setProperty("display", "none", "important");
      zoomOutButton.style.setProperty("pointer-events", "none", "important");
    }

    var toggleButton = document.createElement("div");
    toggleButton.id = "miniappOptionsToggle";
    toggleButton.className = "ui_control";
    toggleButton.setAttribute("role", "button");
    toggleButton.setAttribute("aria-label", "切换显示模式");
    toggleButton.setAttribute("title", "切换显示模式");
    toggleButton.setAttribute("data-miniapp-footechs-options-toggle", "true");
    toggleButton.innerHTML =
      '<svg viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
      '<g fill="none" stroke="#323233" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">' +
      '<circle cx="50" cy="50" r="49"></circle>' +
      '<path d="M11 50 C22 31 35 22 50 22 C65 22 78 31 89 50 C78 69 65 78 50 78 C35 78 22 69 11 50 Z"></path>' +
      '<circle cx="50" cy="50" r="6"></circle>' +
      "</g>" +
      "</svg>";
    toggleButton.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!toggleDisplayModeOption()) {
        window.setTimeout(toggleDisplayModeOption, 120);
      }
    });
    host.insertBefore(toggleButton, zoomOutButton || null);
  }

  function applyMiniappLayout(root) {
    var partsListOpen = syncPartsListState();
    keepMiniappTitle();
    hideBackButtons(root);
    replaceZoomOutWithOptions();
    installLoadingOverlay();
    requestHidePliPreview();
    if (previewClosed && !partsListOpen) keepModelVisible();
    restorePliPreviewInteractivity();
    tryRemoveLoadingOverlay();
  }

  function watchMiniappLayout() {
    var style = document.createElement("style");
    style.textContent =
      'html.miniapp-footechs [data-miniapp-footechs-back], ' +
      'html.miniapp-footechs #tBack, ' +
      'html.miniapp-footechs a[href*="history.back"], ' +
      'html.miniapp-footechs #zoom_out_button_large, ' +
      'html.miniapp-footechs #optionsButton, ' +
      'html.miniapp-footechs [data-miniapp-footechs-hidden-control] { display: none !important; pointer-events: none !important; } ' +
      'html.miniapp-footechs #options2, html.miniapp-footechs #options2.open { display: none !important; pointer-events: none !important; } ' +
      'html.miniapp-footechs #modelTitle, html.miniapp-footechs #modelTitle2 { display: none !important; } ' +
      'html.miniapp-footechs #instructions_decorations { top: 0 !important; } ' +
      'html.miniapp-footechs #main_canvas_holder:not(.close) { display: block !important; } ' +
      'html.miniapp-footechs #partslist.open { position: fixed !important; inset: 0 !important; z-index: 9000 !important; display: block !important; background: #fff !important; overflow: hidden !important; pointer-events: auto !important; } ' +
      'html.miniapp-footechs #partslist.open #big_parts { position: absolute !important; inset: 0 0 18vw 0 !important; z-index: 9000 !important; width: 100% !important; height: auto !important; box-sizing: border-box !important; overflow: auto !important; -webkit-overflow-scrolling: touch !important; background: #fff !important; pointer-events: auto !important; } ' +
      'html.miniapp-footechs #partslist.open #partslist_close { z-index: 9001 !important; } ' +
      'html.miniapp-footechs #camera_buttons #miniappOptionsToggle { position: relative !important; display: inline-block !important; width: 100px !important; height: 100px !important; top: auto !important; right: auto !important; bottom: auto !important; left: auto !important; vertical-align: top !important; } ' +
      'html.miniapp-footechs #camera_buttons #miniappOptionsToggle svg { display: block; width: 56px !important; height: 56px !important; margin: auto !important; } ' +
      '@media screen and (max-width: 760px) { html.miniapp-footechs #camera_buttons #miniappOptionsToggle { width: 12vw !important; height: 10vw !important; } html.miniapp-footechs #camera_buttons #miniappOptionsToggle svg { width: 10vw !important; height: 10vw !important; } }';
    document.head.appendChild(style);

    applyMiniappLayout(document);
    var layoutFrame = 0;
    function scheduleMiniappLayout() {
      if (layoutFrame) return;
      layoutFrame = window.requestAnimationFrame(function () {
        layoutFrame = 0;
        applyMiniappLayout(document);
      });
    }

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        if (mutations[i].type === "attributes") {
          scheduleMiniappLayout();
          continue;
        }
        for (var j = 0; j < mutations[i].addedNodes.length; j += 1) {
          applyMiniappLayout(mutations[i].addedNodes[j]);
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
      childList: true,
      characterData: true,
      subtree: true
    });

    [250, 600, 1000, 1600, 2600, 4200, 6800, 10000].forEach(function (delay) {
      window.setTimeout(function () {
        if (previewClosed) keepModelVisible();
        requestHidePliPreview();
        tryRemoveLoadingOverlay();
      }, delay);
    });

    var loadingInterval = window.setInterval(function () {
      requestHidePliPreview();
      if (tryRemoveLoadingOverlay()) window.clearInterval(loadingInterval);
    }, 300);
  }

  if (enabled) {
    preventSavedSteps();
    document.documentElement.className += " miniapp-embed miniapp-footechs";
    keepMiniappTitle();
    installLoadingOverlayStyle();
    installLoadingOverlayWhenPossible();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", watchMiniappLayout);
    } else {
      watchMiniappLayout();
    }
  }
})();
