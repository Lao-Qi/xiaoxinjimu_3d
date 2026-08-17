(function () {
  "use strict";

  if (typeof window.data === "undefined") {
    window.data = {};
  }

  var NativeFunction = window.Function;
  var blockedDynamicCode = /(?:^|[;\s])debugger(?:[;\s]|$)|while\s*\(\s*true\s*\)\s*\{\s*\}/;
  var SafeFunction = function () {
    var body = arguments.length ? String(arguments[arguments.length - 1]) : "";
    if (blockedDynamicCode.test(body)) {
      return function () {};
    }
    return NativeFunction.apply(this, arguments);
  };

  SafeFunction.prototype = NativeFunction.prototype;
  try {
    Object.getOwnPropertyNames(NativeFunction).forEach(function (key) {
      if (!(key in SafeFunction)) {
        Object.defineProperty(SafeFunction, key, Object.getOwnPropertyDescriptor(NativeFunction, key));
      }
    });
    Object.defineProperty(NativeFunction.prototype, "constructor", {
      configurable: true,
      writable: true,
      value: SafeFunction,
    });
    window.Function = SafeFunction;
  } catch (error) {
    window.Function = SafeFunction;
  }

  var phpToHtml = function (value) {
    if (typeof value !== "string") return value;
    return value.replace(/\.php(?=([?#]|$))/g, ".html");
  };

  var isMocmetaPage = function () {
    return /\/footechs\/mocmeta\.html$/i.test(window.location.pathname);
  };

  var managerReturnUrl = function () {
    try {
      var saved = window.sessionStorage && window.sessionStorage.getItem("managerReturnUrl");
      if (saved) return saved;
    } catch (error) {}
    return "/";
  };

  var shouldUseManagerReturn = function (target) {
    if (!isMocmetaPage() || !target) return false;

    var anchor = target.closest ? target.closest("a[href]") : null;
    if (anchor) {
      var href = anchor.getAttribute("href") || "";
      if (/modelsLoader|blockLoader|3d\.html|3d\.php|history\.back/i.test(href)) {
        return true;
      }
    }

    var node = target.closest ? target.closest("[id],[class],img,button") : target;
    while (node && node !== document.body) {
      var marker = [
        node.id || "",
        typeof node.className === "string" ? node.className : "",
        node.getAttribute ? node.getAttribute("src") || "" : "",
        node.getAttribute ? node.getAttribute("alt") || "" : "",
        node.getAttribute ? node.getAttribute("title") || "" : "",
      ].join(" ").toLowerCase();

      if (marker.indexOf("back") >= 0 || marker.indexOf("return") >= 0) {
        return true;
      }
      node = node.parentElement;
    }

    return false;
  };

  var goManagerReturn = function () {
    window.location.href = managerReturnUrl();
  };

  var rewriteBackLinks = function () {
    if (!isMocmetaPage()) return;
    var anchors = document.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i += 1) {
      var href = anchors[i].getAttribute("href") || "";
      if (/modelsLoader|blockLoader|3d\.html|3d\.php|history\.back/i.test(href)) {
        anchors[i].setAttribute("href", managerReturnUrl());
      }
    }
  };

  document.addEventListener(
    "click",
    function (event) {
      if (shouldUseManagerReturn(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        goManagerReturn();
        return;
      }

      var target = event.target && event.target.closest
        ? event.target.closest("a[href]")
        : null;
      if (!target) return;

      var rawHref = target.getAttribute("href");
      var nextHref = phpToHtml(rawHref);
      if (nextHref !== rawHref) {
        event.preventDefault();
        window.location.href = nextHref;
      }
    },
    true
  );

  if (isMocmetaPage()) {
    try {
      window.history.back = goManagerReturn;
    } catch (error) {}

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", rewriteBackLinks);
    } else {
      rewriteBackLinks();
    }

    var rewriteCount = 0;
    var rewriteTimer = window.setInterval(function () {
      rewriteBackLinks();
      rewriteCount += 1;
      if (rewriteCount >= 20) {
        window.clearInterval(rewriteTimer);
      }
    }, 500);
  }

  if (window.XMLHttpRequest) {
    var originalOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      arguments[1] = phpToHtml(url);
      return originalOpen.apply(this, arguments);
    };
  }

  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function (resource, init) {
      if (typeof resource === "string") {
        resource = phpToHtml(resource);
      } else if (resource && typeof resource.url === "string") {
        var rewritten = phpToHtml(resource.url);
        if (rewritten !== resource.url) {
          resource = new Request(rewritten, resource);
        }
      }
      return originalFetch.call(this, resource, init);
    };
  }
})();
