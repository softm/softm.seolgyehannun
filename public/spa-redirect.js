(function redirectToSinglePageApp() {
  var path = window.location.pathname || "/";
  var target = window.location.origin + "/#" + path + window.location.search + window.location.hash;
  window.location.replace(target);
}());
