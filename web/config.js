(function () {
  var override = document.querySelector('meta[name="apollo-api-url"]');
  var explicit = override && override.content && override.content.trim();
  var defaultApi = window.location.origin || "";
  window.APOLLO_API_URL = explicit || defaultApi;
})();
