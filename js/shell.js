(function () {
  const page = document.body.getAttribute("data-page") || "";
  const active = (p) => page === p ? " active" : "";
  const header = `
<nav class="navbar navbar-expand-lg cw-nav sticky-top">
  <div class="container">
    <a class="navbar-brand cw-brand d-flex align-items-center gap-2" href="index.html">
      <span class="mark">1404</span>
      <span>Constitutional Workshop</span>
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#cwNav" aria-controls="cwNav" aria-expanded="false" aria-label="Menu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="cwNav">
      <ul class="navbar-nav me-auto mb-2 mb-lg-0">
        <li class="nav-item"><a class="nav-link${active("home")}" href="index.html">Home</a></li>
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle${["seats","submit"].includes(page)?" active":""}" href="#" data-bs-toggle="dropdown">Participate</a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="guide.html"><i class="fa-solid fa-book-open me-2"></i>How to take part</a></li>
            <li><a class="dropdown-item" href="seats.html"><i class="fa-solid fa-chair me-2"></i>Get a seat</a></li>
            <li><a class="dropdown-item" href="submit.html"><i class="fa-solid fa-pen-to-square me-2"></i>Write a clause</a></li>
          </ul>
        </li>
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle${["ledger","draft","clause"].includes(page)?" active":""}" href="#" data-bs-toggle="dropdown">Record</a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="ledger.html"><i class="fa-solid fa-list me-2"></i>Clause ledger</a></li>
            <li><a class="dropdown-item" href="draft.html"><i class="fa-solid fa-scroll me-2"></i>Living draft</a></li>
            <li><a class="dropdown-item" href="governor.html"><i class="fa-solid fa-landmark me-2"></i>For a later Governor</a></li>
          </ul>
        </li>
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle${["guide","about","legal"].includes(page)?" active":""}" href="#" data-bs-toggle="dropdown">Help</a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="guide.html"><i class="fa-solid fa-circle-question me-2"></i>Guide &amp; examples</a></li>
            <li><a class="dropdown-item" href="about.html"><i class="fa-solid fa-info me-2"></i>About this record</a></li>
            <li><a class="dropdown-item" href="legal.html"><i class="fa-solid fa-scale-balanced me-2"></i>Terms &amp; policy</a></li>
          </ul>
        </li>
      </ul>
      <button class="btn btn-wallet" type="button" data-wallet>Connect wallet</button>
    </div>
  </div>
</nav>`;
  const footer = `
<footer class="cw-foot py-4 mt-5">
  <div class="container d-flex flex-column flex-md-row justify-content-between gap-2 small">
    <div>Chain 1404 formation record · not a treasury · not the BDAG company</div>
    <div class="d-flex gap-3">
      <a class="link-light link-underline-opacity-0" href="guide.html">Guide</a>
      <a class="link-light link-underline-opacity-0" href="legal.html">Legal</a>
      <a class="link-light link-underline-opacity-0" href="about.html">About</a>
    </div>
  </div>
</footer>
<div id="toast" class="toast-cw"></div>`;
  const mount = document.getElementById("cw-header");
  const foot = document.getElementById("cw-footer");
  if (mount) mount.outerHTML = header;
  if (foot) foot.outerHTML = footer;
})();
