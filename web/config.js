(function () {
  var override = document.querySelector('meta[name="apollo-api-url"]');
  window.APOLLO_API_URL = (override && override.content && override.content.trim()) || window.location.origin;
})();
