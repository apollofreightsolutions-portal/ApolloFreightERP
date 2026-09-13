(function () {
  var override = document.querySelector('meta[name="apollo-api-url"]');
  var explicit = override && override.content && override.content.trim();
  var isVercel = /\.vercel\.app$/i.test(window.location.hostname || "");
  var defaultApi = isVercel ? "https://apollo-freighterp-f9kt.onrender.com" : (window.location.origin || "");
  window.APOLLO_API_URL = explicit || defaultApi;
})();
