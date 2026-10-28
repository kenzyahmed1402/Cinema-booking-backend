/* Runs before the page draws, so it never flashes the wrong theme.
   A theme the visitor picked on this site wins; otherwise follow their device. */
(function () {
  var d = document.documentElement, t = null;
  try { t = localStorage.getItem("theme"); } catch (e) {}
  if (t !== "dark" && t !== "light") {
    t = "light";
    try { if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) { t = "dark"; } } catch (e) {}
  }
  d.setAttribute("data-theme", t);
  var m = document.getElementById("themeColor");
  if (m) { m.setAttribute("content", t === "dark" ? "#0a0a0c" : "#ffffff"); }
})();
