(function (g) {
  const ART = ["", "Membership", "Governor", "Scope", "Infrastructure", "Amendment"];
  const RPC_KEY = "cw1404.rpc";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = {
    cfg: null,
    provider: null,
    signer: null,
    rec: null,
    account: null,
    chain: null,
  };

  function toast(msg) {
    const n = $("#toast") || Object.assign(document.body.appendChild(document.createElement("div")), { id: "toast", className: "toast" });
    n.className = "toast-cw on";
    n.textContent = msg;
    clearTimeout(n._t);
    n._t = setTimeout(() => n.classList.remove("on"), 5200);
  }

  function short(a) {
    return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
  }

  function published() {
    const a = state.cfg && state.cfg.workshop;
    return a && !/^0x0{40}$/i.test(a);
  }

  function savedRpc() {
    try { return localStorage.getItem(RPC_KEY) || ""; } catch (_) { return ""; }
  }

  function allRpcs() {
    const listed = (state.cfg && state.cfg.rpcs) || [];
    const extra = savedRpc();
    const out = [];
    if (extra) out.push(extra);
    listed.forEach((u) => { if (u && !out.includes(u)) out.push(u); });
    return out;
  }

  async function loadCfg() {
    const tries = ["./launch.json", "launch.json"];
    for (const u of tries) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch (_) {}
    }
    return {
      chainId: 1404,
      name: "BlockDAG",
      currency: "BDAG",
      decimals: 18,
      rpcs: [
        "https://rpc.east.bdag-us.org",
        "https://rpc.west.bdag-us.org",
        "https://rpc.welshdag.trade",
        "https://rpc.capedag.com",
        "https://rpc.dvdmining.com",
        "https://rpc.blockdag.engineering",
        "https://rms-bdag-rpc.de/api/rpc-live",
        "https://rms-bdag-rpc.de/api/rpc-wallet"
      ],
      explorers: [
        "https://explorer.east.bdag-us.org",
        "https://explorer.west.bdag-us.org",
        "https://scan.welshdag.trade",
        "https://explorer.blockdag.engineering"
      ],
      workshop: "0x897d85654c569e64dff78b90bfb7ebe12ee7a67d",
    };
  }

  function rpcProvider() {
    const url = allRpcs()[0];
    if (!url || !g.ethers) return null;
    return new g.ethers.JsonRpcProvider(url, Number(state.cfg.chainId));
  }

  async function bindRead() {
    if (!published() || !g.ethers) return;
    const p = state.signer ? state.signer.provider : rpcProvider();
    if (!p) return;
    state.provider = p;
    state.rec = new g.ethers.Contract(state.cfg.workshop, g.WORKSHOP_ABI, state.signer || p);
  }

  async function connect() {
    try {
      const eth = g.ethereum;
      if (!eth) {
        toast("Open this site inside MetaMask Browser (phone) or use the MetaMask extension (computer).");
        return;
      }
      const acc = await eth.request({ method: "eth_requestAccounts" });
      state.account = acc[0];
      const hexId = await eth.request({ method: "eth_chainId" });
      state.chain = parseInt(hexId, 16);
      const want = Number(state.cfg.chainId);
      const hex = "0x" + want.toString(16);
      if (state.chain !== want) {
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: hex }],
          });
          state.chain = want;
        } catch (err) {
          if (err && err.code === 4902) {
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: hex,
                chainName: state.cfg.name || "Chain 1404",
                nativeCurrency: {
                  name: state.cfg.currency || "BDAG",
                  symbol: state.cfg.currency || "BDAG",
                  decimals: state.cfg.decimals || 18,
                },
                rpcUrls: allRpcs(),
                blockExplorerUrls: state.cfg.explorers || [],
              }],
            });
            state.chain = want;
          } else {
            toast("Wrong network. Switch to chain " + want + ".");
            return;
          }
        }
      }
      const browser = new g.ethers.BrowserProvider(eth);
      state.signer = await browser.getSigner();
      state.account = await state.signer.getAddress();
      const net = await browser.getNetwork();
      state.chain = Number(net.chainId);
      if (state.chain !== want) {
        toast("Wallet is still on chain " + state.chain + ". Need " + want + ".");
        return;
      }
      await bindRead();
      paintWallet();
      g.dispatchEvent(new Event("workshop:ready"));
    } catch (err) {
      toast((err && (err.shortMessage || err.message)) || "Wallet connect failed.");
    }
  }

  function paintWallet() {
    $$("[data-wallet]").forEach((el) => {
      if (state.account) {
        el.dataset.on = "1";
        el.textContent = short(state.account) + " · " + (state.cfg.name || "1404");
      } else {
        el.dataset.on = "0";
        el.textContent = "Connect wallet";
      }
    });
  }

  async function stats() {
    const box = {
      issued: 0, active: 0, posted: 0, sealedCount: 0,
      openedAt: 0, closedAt: 0, seatBond: 0n, rollingRoot: "—",
      address: published() ? state.cfg.workshop : "unpublished",
    };
    if (!state.rec) return box;
    const rec = state.rec;
    const [issued, active, posted, sealedCount, openedAt, closedAt, seatBond, rollingRoot] = await Promise.all([
      rec.issued(), rec.active(), rec.posted(), rec.sealedCount(),
      rec.openedAt(), rec.closedAt(), rec.seatBond(), rec.rollingRoot(),
    ]);
    box.issued = Number(issued);
    box.active = Number(active);
    box.posted = Number(posted);
    box.sealedCount = Number(sealedCount);
    box.openedAt = Number(openedAt);
    box.closedAt = Number(closedAt);
    box.seatBond = seatBond;
    box.rollingRoot = rollingRoot;
    return box;
  }

  async function loadClause(id) {
    if (!state.rec) return null;
    const c = await state.rec.clause(id);
    if (Number(c.state) === 0) return null;
    let ready = { ready: false, reason: "0x" };
    try { ready = await state.rec.sealReady(id); } catch (_) {}
    let mark = 0;
    if (state.account) {
      try { mark = Number(await state.rec.ballotOf(id, state.account)); } catch (_) {}
    }
    return { id, c, ready, mark };
  }

  async function listClauses(n) {
    const out = [];
    if (!state.rec || n <= 0) return out;
    const start = Math.max(1, n - 19);
    for (let i = n; i >= start; i--) {
      try {
        const row = await loadClause(i);
        if (row) out.push(row);
      } catch (_) {}
    }
    return out;
  }

  function when(ts) {
    if (!ts) return "—";
    return new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }

  function statusPill(stateN, ready) {
    if (stateN === 2) return '<span class="pill lock">Sealed</span>';
    if (ready) return '<span class="pill cool">Sealable</span>';
    return '<span class="pill open">Open</span>';
  }

  async function send(fn, args, value) {
    if (!state.signer || !state.rec) {
      toast("Connect a wallet on chain " + state.cfg.chainId + ".");
      return;
    }
    const c = state.rec.connect(state.signer);
    const plain = {
      Closed: "This action is not available in the current window.",
      NotYet: "The workshop has not opened yet.",
      Ended: "New writing is closed. Sealing can still happen.",
      Bound: "This wallet already has a seat.",
      Vacant: "You need a seat first. Open Get a seat.",
      Gone: "This wallet already gave up its seat. It cannot sit again.",
      Dup: "You already marked this clause.",
      BadBond: "The seat payment does not match the required bond.",
      TooLong: "Title or body is too long.",
      Empty: "Title and body cannot be empty.",
      BadArticle: "Pick one of the five articles.",
      Quota: "This seat already has 5 unsealed clauses.",
      Unknown: "That clause does not exist.",
      Frozen: "This clause is already sealed.",
      Early: "Wait 3 days after the clause was posted.",
      Short: "Not enough seated members have voted yet (need 50% of the snapshot).",
      Thin: "Yea must be more than nay.",
      Same: "That mark is already recorded.",
      Locked: "Please wait and try again.",
      NoCash: "Not enough BDAG in the wallet.",
      "user rejected": "You declined the wallet popup.",
    };
    try {
      const opts = {};
      if (value) opts.value = value;
      toast("Confirm in your wallet…");
      const tx = await c[fn](...args, opts);
      toast("Sent. Waiting for the network…");
      await tx.wait();
      toast("Done. The record updated.");
      g.dispatchEvent(new Event("workshop:ready"));
    } catch (err) {
      let m = (err && (err.shortMessage || err.reason || err.message)) || "rejected";
      for (const [k, v] of Object.entries(plain)) {
        if (String(m).includes(k)) { m = v; break; }
      }
      toast(m);
    }
  }

  async function bootPage() {
    state.cfg = await loadCfg();
    await bindRead();
    paintWallet();
    if (!document.documentElement.dataset.bound) {
      document.documentElement.dataset.bound = "1";
      $$("[data-wallet]").forEach((el) => el.addEventListener("click", connect));
    }
    const page = document.body.dataset.page;
    if (page === "home") return home();
    if (page === "submit") return submitPage();
    if (page === "ledger") return ledger();
    if (page === "clause") return clausePage();
    if (page === "draft") return draft();
    if (page === "governor") return governor();
    if (page === "seats") return seats();
    if (page === "guide" || page === "about" || page === "legal") return;
  }

  async function home() {
    const s = await stats();
    const set = (k, v) => { const n = $("[data-k='" + k + "']"); if (n) n.textContent = v; };
    set("active", s.active);
    set("posted", s.posted);
    set("sealed", s.sealedCount);
    set("issued", s.issued);
    set("addr", s.address);
    const q = s.issued ? Math.round((s.sealedCount / Math.max(s.posted, 1)) * 100) + "%" : "—";
    set("ratio", q);
    const tb = $("#rows");
    if (!tb) return;
    const rows = await listClauses(s.posted);
    tb.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td>#C-${r.id}</td>
        <td>${ART[Number(r.c.article)] || r.c.article}</td>
        <td><a href="clause.html?id=${r.id}">${escapeHtml(r.c.title)}</a></td>
        <td>${statusPill(Number(r.c.state), r.ready.ready)}</td>
        <td>${r.c.yea}</td>
      </tr>`).join("") : `<tr><td colspan="5">${published() ? "No clauses yet." : "Record address unpublished — connect after launch.json is filled."}</td></tr>`;
  }

  async function ledger() {
    const s = await stats();
    const tb = $("#rows");
    if (!tb) return;
    const rows = await listClauses(s.posted);
    tb.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td>#C-${r.id}</td>
        <td>${ART[Number(r.c.article)] || r.c.article}</td>
        <td><a href="clause.html?id=${r.id}">${escapeHtml(r.c.title)}</a></td>
        <td>${short(r.c.author)}</td>
        <td>${statusPill(Number(r.c.state), r.ready.ready)}</td>
        <td>${r.c.yea}</td>
        <td>${r.c.nay}</td>
      </tr>`).join("") : `<tr><td colspan="7">${published() ? "Empty ledger." : "Unpublished record."}</td></tr>`;
  }

  async function submitPage() {
    const s = await stats();
    const bondEl = $("#bondHint");
    if (bondEl && s.seatBond) bondEl.textContent = g.ethers ? g.ethers.formatEther(s.seatBond) + " " + (state.cfg.currency || "BDAG") : String(s.seatBond);
    const form = $("#submitForm");
    if (!form || form.dataset.wired) return;
    form.dataset.wired = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const article = Number($("#article").value);
      const title = $("#title").value.trim();
      const body = $("#body").value.trim();
      if (!title || !body) return toast("Title and body are required.");
      await send("submit", [article, title, body]);
    });
    $("#attestBtn") && $("#attestBtn").addEventListener("click", async () => {
      const s2 = await stats();
      await send("attest", [], s2.seatBond);
    });
    $("#previewBtn") && $("#previewBtn").addEventListener("click", () => {
      if (!g.ethers) return;
      const t = g.ethers.keccak256(g.ethers.toUtf8Bytes($("#title").value));
      const b = g.ethers.keccak256(g.ethers.toUtf8Bytes($("#body").value));
      $("#hashBox").textContent = "title " + t + "\nbody  " + b;
    });
  }

  async function clausePage() {
    const id = Number(new URLSearchParams(location.search).get("id") || "0");
    const mount = $("#clauseMount");
    if (!id || !mount) {
      if (mount) mount.innerHTML = "<p class='sub'>Missing clause id.</p>";
      return;
    }
    const row = await loadClause(id);
    if (!row) {
      mount.innerHTML = "<p class='sub'>Unknown clause.</p>";
      return;
    }
    const c = row.c;
    const pct = Number(c.census) ? Math.min(100, Math.round((Number(c.yea) / Number(c.census)) * 100)) : 0;
    mount.innerHTML = `
      <div class="kicker mb-2">Clause #C-${id} · Article ${c.article} ${ART[Number(c.article)] || ""}</div>
      <h1 class="fw-bold">${escapeHtml(c.title)}</h1>
      <p style="color:var(--muted)">Author ${short(c.author)} · posted ${when(Number(c.postedAt))} · census ${c.census} ${statusPill(Number(c.state), row.ready.ready)}</p>
      <div class="row g-4">
        <div class="col-lg-7">
          <div class="glass p-4">
            <div class="kicker mb-2">The rule</div>
            <p class="fs-5">${escapeHtml(c.body)}</p>
            <hr class="border-secondary opacity-25" />
            <div class="mono">titleHash ${c.titleHash}<br>bodyHash ${c.bodyHash}</div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="glass p-4">
            <div class="kicker mb-2">Your mark</div>
            <h5>${Number(c.state) === 2 ? "Already sealed" : (row.mark ? "You already voted" : "You have not voted")}</h5>
            <div class="progress my-3" style="height:8px;background:#0a101c"><div class="progress-bar" style="width:${pct}%;background:var(--gold)"></div></div>
            <p style="color:var(--muted)">${c.yea} yea · ${c.nay} nay · need 50% of census ${c.census}</p>
            <div class="d-flex gap-2">
              <button class="btn btn-gold" data-v="1" ${Number(c.state)===2?"disabled":""}>Yea</button>
              <button class="btn btn-ghost" data-v="0" ${Number(c.state)===2?"disabled":""}>Nay</button>
            </div>
            <button class="btn btn-ghost w-100 mt-3" data-seal ${row.ready.ready?"":"disabled"}>Seal this clause</button>
            <p class="small mt-3 mb-0" style="color:var(--muted)">Seal stays off until 3 days have passed, enough seats have voted, and yea beats nay.</p>
          </div>
        </div>
      </div>`;
    mount.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => send("vote", [id, b.dataset.v === "1"])));
    const seal = mount.querySelector("[data-seal]");
    if (seal) seal.addEventListener("click", () => send("seal", [id]));
  }

  async function draft() {
    const s = await stats();
    const mount = $("#draftMount");
    if (!mount) return;
    if (!s.posted) {
      mount.innerHTML = "<p style='color:var(--muted)'>Nothing is sealed yet. The living draft stays empty until a clause is locked.</p>";
      return;
    }
    const parts = [];
    for (let i = 1; i <= s.posted; i++) {
      const row = await loadClause(i);
      if (row && Number(row.c.state) === 2) {
        parts.push(`<h5>Article ${row.c.article} — ${escapeHtml(row.c.title)}</h5><p style="color:var(--muted)">${escapeHtml(row.c.body)}</p>`);
      }
    }
    mount.innerHTML = `<div class="kicker">rollingRoot ${s.rollingRoot}</div>` +
      (parts.length ? parts.join("") : "<p class='sub'>Clauses exist, none sealed.</p>");
  }

  async function governor() {
    const s = await stats();
    const set = (k, v) => { const n = $("[data-k='" + k + "']"); if (n) n.textContent = v; };
    set("sealed", s.sealedCount);
    set("open", Math.max(0, s.posted - s.sealedCount));
    set("root", s.rollingRoot);
    set("window", s.openedAt ? when(s.openedAt) + " → " + when(s.closedAt) : "—");
  }

  async function seats() {
    const s = await stats();
    const set = (k, v) => { const n = $("[data-k='" + k + "']"); if (n) n.textContent = v; };
    set("active", s.active);
    set("issued", s.issued);
    set("bond", s.seatBond && g.ethers ? g.ethers.formatEther(s.seatBond) : "—");
    const box = $("#rpcBox");
    if (box) box.value = savedRpc() || (allRpcs()[0] || "");
    const save = $("#saveRpc");
    if (save && !save.dataset.wired) {
      save.dataset.wired = "1";
      save.addEventListener("click", async () => {
        const u = (($("#rpcBox") && $("#rpcBox").value) || "").trim();
        if (!/^https:\/\//i.test(u)) return toast("RPC must start with https://");
        try { localStorage.setItem(RPC_KEY, u); } catch (_) {}
        toast("Saved. Using that community RPC for reads.");
        await bindRead();
        seats();
      });
    }
    const mine = $("#mine");
    if (!mine) return;
    if (!state.account) {
      mine.innerHTML = `<p class="mb-2" style="color:var(--muted)">Connect a wallet first, then attest.</p>
        <button class="btn btn-gold" type="button" data-wallet>Connect wallet</button>`;
      mine.querySelector("[data-wallet]")?.addEventListener("click", connect);
      return;
    }
    if (!state.rec) {
      mine.innerHTML = `<p style="color:var(--muted)">Connected, but the record RPC did not load. Paste another community RPC above.</p>`;
      return;
    }
    const seat = await state.rec.seatOf(state.account);
    const id = Number(seat.id);
    mine.innerHTML = id
      ? `<div class="kicker mb-2">Your seat</div><h3>#${id} · ${short(state.account)}</h3>
         <p style="color:var(--muted)">Joined ${when(Number(seat.joinedAt))} · written ${seat.authored} · still open ${seat.unsealed}</p>
         <button class="btn btn-ghost" id="rev" type="button">Give up this seat</button>`
      : `<div class="kicker mb-2">No seat yet</div><p style="color:var(--muted)">Attest burns the seat bond. Giving it up is permanent for this wallet.</p>
         <button class="btn btn-gold" id="join" type="button">Attest and sit</button>`;
    $("#rev") && $("#rev").addEventListener("click", () => send("revoke", []));
    $("#join") && $("#join").addEventListener("click", () => send("attest", [], s.seatBond));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  g.Workshop = { bootPage, connect, state, ART };
  document.addEventListener("DOMContentLoaded", bootPage);
  g.addEventListener("workshop:ready", () => bootPage());
})(window);
