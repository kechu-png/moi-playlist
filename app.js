/* 喵西Moi 歌单 —— 渲染 / 搜索 / 分组筛选 / 本地加歌 */
(function () {
  "use strict";

  var BASE = window.PLAYLIST || {};
  var META = BASE.meta || {};
  var STORE_KEY = "moi-playlist-additions-v1";

  function $(id) { return document.getElementById(id); }

  var el = {
    name: $("pageName"), stats: $("stats"), banner: $("banner"),
    portrait: $("portrait"), portraitFallback: $("portraitFallback"),
    search: $("search"), clear: $("clear"), chips: $("chips"),
    list: $("list"), empty: $("empty"), count: $("resultCount"),
    theme: $("themeToggle"), addBtn: $("addBtn"),
    dialog: $("addDialog"), form: $("addForm"),
    fGroup: $("f-group"), fNewGroup: $("f-newgroup"), newGroupField: $("newGroupField"),
    fOriginal: $("f-original"), fTitle: $("f-title"), fRemark: $("f-remark"),
    originals: $("originals"), localList: $("localList"),
    btnExport: $("btnExport"), btnCancel: $("btnCancel"), btnClose: $("btnClose"),
    toast: $("toast"), footSource: $("footSource")
  };

  var state = { q: "", group: -1 };

  /* ============ 小工具（兼容老浏览器） ============ */
  function setChildren(node, frag) {
    if (typeof node.replaceChildren === "function") {
      node.replaceChildren(frag);
    } else {
      while (node.firstChild) node.removeChild(node.firstChild);
      node.appendChild(frag);
    }
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function toggleClass(node, name, on) {
    if (on) {
      if (node.classList) node.classList.add(name);
      else node.className += " " + name;
    } else {
      if (node.classList) node.classList.remove(name);
      else node.className = node.className.replace(new RegExp("\\b" + name + "\\b", "g"), "");
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ============ 本地新增 ============ */
  function loadAdditions() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Object.prototype.toString.call(arr) === "[object Array]" ? arr : [];
    } catch (e) { return []; }
  }

  function saveAdditions(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch (e) {
      toast("浏览器不允许本地保存，新增仅本次有效");
    }
  }

  var additions = loadAdditions();

  // 导出并替换 songs.js 之后，本机新增里会残留已经进入 base 的条目
  (function reconcile() {
    var baseKeys = {};
    (BASE.groups || []).forEach(function (g) {
      (g.songs || []).forEach(function (s) {
        baseKeys[g.title + "\u0000" + s.title] = 1;
      });
    });
    var kept = additions.filter(function (a) {
      return !baseKeys[a.group + "\u0000" + a.title];
    });
    if (kept.length !== additions.length) {
      additions = kept;
      saveAdditions(additions);
    }
  })();

  /* ============ 数据合并 ============ */
  function mergedGroups() {
    var groups = (BASE.groups || []).map(function (g) {
      return {
        title: g.title || "未分组",
        note: g.note || "",
        songs: (g.songs || []).map(function (s) {
          return {
            title: s.title || "",
            original: s.original || "",
            remark: s.remark || "",
            star: !!s.star
          };
        })
      };
    });

    additions.forEach(function (add) {
      var group = null;
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].title === add.group) { group = groups[i]; break; }
      }
      if (!group) {
        group = { title: add.group, note: "", songs: [] };
        groups.push(group);
      }
      var song = {
        title: add.title,
        original: add.original || "",
        remark: add.remark || "",
        star: false,
        local: true,
        id: add.id
      };
      var insertAt = -1;
      if (song.original) {
        for (var j = 0; j < group.songs.length; j++) {
          if (group.songs[j].original === song.original) insertAt = j + 1;
        }
      }
      if (insertAt === -1) group.songs.push(song);
      else group.songs.splice(insertAt, 0, song);
    });

    return sortByOrder(groups);
  }

  /* 按 meta.order 指定的顺序排列分组；未列出的保持原序排到最后 */
  function sortByOrder(groups) {
    var order = META.order;
    if (!order || !order.length) return groups;
    var rank = {};
    for (var i = 0; i < order.length; i++) rank[order[i]] = i;
    groups.sort(function (a, b) {
      var ra = rank.hasOwnProperty(a.title) ? rank[a.title] : 9999;
      var rb = rank.hasOwnProperty(b.title) ? rank[b.title] : 9999;
      return ra - rb;
    });
    return groups;
  }

  /* ============ 主题 ============ */
  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    el.theme.textContent = mode === "dark" ? "◐" : "◑";
    el.theme.setAttribute("aria-label", mode === "dark" ? "切换到浅色" : "切换到深色");
    try { localStorage.setItem("moi-theme", mode); } catch (e) {}
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem("moi-theme"); } catch (e) {}
    if (!saved) {
      saved = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches)
        ? "light" : "dark";
    }
    applyTheme(saved);
  }

  el.theme.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  /* ============ 头部 ============ */
  function statNode(bold, text) {
    var span = document.createElement("span");
    if (bold) {
      var b = document.createElement("b");
      b.textContent = bold;
      span.appendChild(b);
    }
    span.appendChild(document.createTextNode(text));
    return span;
  }

  function renderHead(groups) {
    if (META.vtuber) el.name.textContent = META.vtuber;
    document.title = (META.vtuber || "喵西Moi") + " · 歌单";

    var total = groups.reduce(function (n, g) { return n + g.songs.length; }, 0);
    var frag = document.createDocumentFragment();

    frag.appendChild(statNode(String(total), " 首"));
    frag.appendChild(document.createTextNode(" · "));
    frag.appendChild(statNode(String(groups.length), " 个分组"));
    if (META.updatedAt) {
      var dateWrap = document.createElement("span");
      dateWrap.className = "stat-date";
      dateWrap.appendChild(document.createTextNode(" · 更新于 "));
      dateWrap.appendChild(statNode(META.updatedAt, ""));
      frag.appendChild(dateWrap);
    }
    if (additions.length) {
      frag.appendChild(document.createTextNode(" · "));
      var add = document.createElement("span");
      add.className = "add-count";
      add.textContent = "＋" + additions.length + " 首本机";
      frag.appendChild(add);
    }
    setChildren(el.stats, frag);

    if (el.footSource) {
      el.footSource.textContent = META.source ? META.source + " · " : "";
    }

    if (META.sample) {
      el.banner.hidden = false;
      el.banner.textContent = "当前为示例数据。";
    }

    var img = META.art || META.avatar;
    if (img && el.portrait.getAttribute("src") !== img) {
      el.portrait.setAttribute("src", img);
      el.portrait.setAttribute("alt", (META.vtuber || "") + " 立绘");
      el.portrait.hidden = false;
      el.portraitFallback.hidden = true;
    }
  }

  if (el.portrait) {
    el.portrait.addEventListener("error", function () {
      el.portrait.hidden = true;
      el.portraitFallback.hidden = false;
    });
  }

  /* ============ 分组 chips ============ */
  function renderChips(groups) {
    var frag = document.createDocumentFragment();
    var i;

    function chip(label, index) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      if (index === state.group) b.setAttribute("aria-pressed", "true");
      else b.setAttribute("aria-pressed", "false");
      b.appendChild(document.createTextNode(label));
      b.addEventListener("click", function () { setGroup(index); });
      return b;
    }

    frag.appendChild(chip("全部", -1));
    for (i = 0; i < groups.length; i++) {
      frag.appendChild(chip(groups[i].title, i));
    }
    setChildren(el.chips, frag);
  }

  function setGroup(index) {
    state.group = index;
    var chips = el.chips.getElementsByTagName("button");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", i === index + 1 ? "true" : "false");
    }
    render();
  }

  /* ============ 搜索 ============ */
  function normalize(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, "");
  }

  function matches(group, song, q, qNorm) {
    if (!q) return true;
    var hay = [song.title, song.original, song.remark, group.title].join(" ").toLowerCase();
    return hay.indexOf(q) !== -1 || normalize(hay).indexOf(qNorm) !== -1;
  }

  function highlight(text, q) {
    if (!q) return document.createTextNode(text);
    var lower = text.toLowerCase();
    var ql = q.toLowerCase();
    var frag = document.createDocumentFragment();
    var i = 0;
    var at;
    while (i <= text.length) {
      at = lower.indexOf(ql, i);
      if (at === -1) {
        if (i < text.length) frag.appendChild(document.createTextNode(text.substr(i)));
        break;
      }
      if (at > i) frag.appendChild(document.createTextNode(text.substr(i, at - i)));
      var mark = document.createElement("mark");
      mark.appendChild(document.createTextNode(text.substr(at, ql.length)));
      frag.appendChild(mark);
      i = at + ql.length;
    }
    return frag;
  }

  /* ============ 列表 ============ */
  function countSections(group) {
    var seen = {};
    var n = 0;
    group.songs.forEach(function (s) {
      if (s.original && !seen[s.original]) { seen[s.original] = 1; n++; }
    });
    return n;
  }

  function songRow(song, index, q, showOriginal) {
    var li = document.createElement("li");
    li.className = "song" + (song.local ? " local" : "");

    var idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = pad2(index + 1);
    li.appendChild(idx);

    var title = document.createElement("span");
    title.className = "title";
    title.appendChild(highlight(song.title, q));
    if (song.star) {
      var star = document.createElement("span");
      star.className = "star";
      star.textContent = "＊";
      star.title = "原歌单里带 * 标记";
      title.appendChild(star);
    }
    if (song.local) {
      var badge = document.createElement("span");
      badge.className = "local-badge";
      badge.textContent = "本机";
      title.appendChild(badge);
    }
    li.appendChild(title);

    var meta = document.createElement("span");
    meta.className = "meta";

    if (showOriginal && song.original) {
      var orig = document.createElement("span");
      orig.className = "orig";
      orig.title = song.original;
      orig.appendChild(highlight(song.original, q));
      meta.appendChild(orig);
    }
    if (song.remark) {
      var remark = document.createElement("span");
      remark.className = "remark";
      remark.title = song.remark;
      remark.appendChild(highlight(song.remark, q));
      meta.appendChild(remark);
    }
    li.appendChild(meta);
    return li;
  }

  function render() {
    var groups = mergedGroups();
    var q = state.q.replace(/^\s+|\s+$/g, "").toLowerCase();
    var qNorm = normalize(q);
    var frag = document.createDocumentFragment();
    var shown = 0;
    var gi, si;

    for (gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];
      if (state.group !== -1 && state.group !== gi) continue;

      var songs = [];
      for (si = 0; si < group.songs.length; si++) {
        if (matches(group, group.songs[si], q, qNorm)) songs.push(group.songs[si]);
      }
      if (!songs.length) continue;

      var sectioned = countSections(group) >= 2;

      var section = document.createElement("section");
      section.className = "group";

      var head = document.createElement("div");
      head.className = "group-head";

      var h = document.createElement("h2");
      h.className = "group-title";
      h.textContent = group.title;
      head.appendChild(h);

      var line = document.createElement("span");
      line.className = "group-line";
      head.appendChild(line);

      var cnt = document.createElement("span");
      cnt.className = "group-count";
      cnt.textContent = songs.length + " 首";
      head.appendChild(cnt);

      section.appendChild(head);

      var ol = document.createElement("ol");
      ol.className = "songs";

      var current = null;
      for (si = 0; si < songs.length; si++) {
        var song = songs[si];
        if (sectioned) {
          var sec = song.original || "";
          if (sec !== current) {
            current = sec;
            if (sec) {
              var sh = document.createElement("li");
              sh.className = "section-head";
              var dot = document.createElement("span");
              dot.className = "section-dot";
              sh.appendChild(dot);
              sh.appendChild(highlight(sec, q));
              ol.appendChild(sh);
            }
          }
        }
        ol.appendChild(songRow(song, si, q, !sectioned));
      }

      section.appendChild(ol);
      frag.appendChild(section);
      shown += songs.length;
    }

    setChildren(el.list, frag);
    el.empty.hidden = shown !== 0;

    var filtering = q !== "" || state.group !== -1;
    el.count.hidden = !filtering;
    if (filtering) {
      el.count.innerHTML = "找到 <b>" + shown + "</b> 首" +
        (q ? "（关键词：" + escapeHtml(state.q.replace(/^\s+|\s+$/g, "")) + "）" : "");
    }

    el.clear.hidden = q === "";
    renderHead(groups);
  }

  /* ============ 提示条 ============ */
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2800);
  }

  /* ============ 加歌弹窗 ============ */
  function fillGroupSelect() {
    var groups = mergedGroups();
    var frag = document.createDocumentFragment();
    var i;

    for (i = 0; i < groups.length; i++) {
      var o = document.createElement("option");
      o.value = groups[i].title;
      o.textContent = groups[i].title;
      frag.appendChild(o);
    }
    var nw = document.createElement("option");
    nw.value = "__new__";
    nw.textContent = "＋ 新建分组";
    frag.appendChild(nw);
    setChildren(el.fGroup, frag);

    var seen = {};
    var dFrag = document.createDocumentFragment();
    groups.forEach(function (g) {
      g.songs.forEach(function (s) {
        if (s.original && !seen[s.original]) {
          seen[s.original] = 1;
          var op = document.createElement("option");
          op.value = s.original;
          dFrag.appendChild(op);
        }
      });
    });
    setChildren(el.originals, dFrag);
  }

  function renderLocalList() {
    if (!additions.length) {
      setChildren(el.localList, document.createDocumentFragment());
      el.btnExport.disabled = true;
      return;
    }
    el.btnExport.disabled = false;

    var frag = document.createDocumentFragment();
    var title = document.createElement("p");
    title.className = "local-title";
    title.textContent = "本机新增 " + additions.length + " 首";
    frag.appendChild(title);

    additions.forEach(function (add) {
      var row = document.createElement("div");
      row.className = "local-item";

      var label = document.createElement("span");
      label.textContent = add.group + " · " + add.title;
      row.appendChild(label);

      var del = document.createElement("button");
      del.type = "button";
      del.className = "link-btn";
      del.textContent = "删除";
      del.addEventListener("click", function () {
        additions = additions.filter(function (x) { return x.id !== add.id; });
        saveAdditions(additions);
        renderLocalList();
        renderChips(mergedGroups());
        render();
        toast("已删除");
      });
      row.appendChild(del);
      frag.appendChild(row);
    });
    setChildren(el.localList, frag);
  }

  function openDialog() {
    fillGroupSelect();
    renderLocalList();
    el.fTitle.value = "";
    el.fOriginal.value = "";
    el.fRemark.value = "";
    el.fNewGroup.value = "";
    el.newGroupField.hidden = true;
    if (typeof el.dialog.showModal === "function") el.dialog.showModal();
    else el.dialog.setAttribute("open", "");
    setTimeout(function () { el.fTitle.focus(); }, 30);
  }

  function closeDialog() {
    if (typeof el.dialog.close === "function") el.dialog.close();
    else el.dialog.removeAttribute("open");
  }

  el.addBtn.addEventListener("click", openDialog);
  el.btnCancel.addEventListener("click", closeDialog);
  el.btnClose.addEventListener("click", closeDialog);

  el.fGroup.addEventListener("change", function () {
    el.newGroupField.hidden = el.fGroup.value !== "__new__";
    if (!el.newGroupField.hidden) el.fNewGroup.focus();
  });

  el.form.addEventListener("submit", function (e) {
    if (e.preventDefault) e.preventDefault();

    var groupName = el.fGroup.value === "__new__"
      ? el.fNewGroup.value.replace(/^\s+|\s+$/g, "")
      : el.fGroup.value;
    var title = el.fTitle.value.replace(/^\s+|\s+$/g, "");

    if (!groupName) { toast("分组名不能为空"); el.fNewGroup.focus(); return; }
    if (!title) { toast("歌名不能为空"); el.fTitle.focus(); return; }

    var original = el.fOriginal.value.replace(/^\s+|\s+$/g, "");
    var remark = el.fRemark.value.replace(/^\s+|\s+$/g, "");

    var exists = false;
    if (BASE.groups) {
      for (var i = 0; i < BASE.groups.length; i++) {
        if (BASE.groups[i].title !== groupName) continue;
        var list = BASE.groups[i].songs || [];
        for (var j = 0; j < list.length; j++) {
          if (list[j].title === title) { exists = true; break; }
        }
      }
    }
    if (!exists) {
      for (var k = 0; k < additions.length; k++) {
        if (additions[k].group === groupName && additions[k].title === title) { exists = true; break; }
      }
    }
    if (exists) { toast("「" + groupName + "」里已经有《" + title + "》了"); return; }

    additions.push({
      id: "a" + new Date().getTime().toString(36) + Math.random().toString(36).substr(2, 5),
      group: groupName,
      title: title,
      original: original,
      remark: remark
    });
    saveAdditions(additions);

    closeDialog();
    renderChips(mergedGroups());
    render();
    toast("已添加《" + title + "》，导出后才对粉丝生效");
  });

  /* ============ 导出 ============ */
  function buildExportText() {
    var groups = mergedGroups().map(function (g) {
      return {
        title: g.title,
        note: g.note,
        songs: g.songs.map(function (s) {
          var o = { title: s.title, original: s.original, remark: s.remark };
          if (s.star) o.star = true;
          return o;
        })
      };
    });

    var now = new Date();
    var payload = {
      meta: {
        vtuber: META.vtuber || "喵西Moi",
        updatedAt: now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate()),
        source: META.source || "",
        avatar: META.avatar || "",
        art: META.art || "",
        order: META.order || [],
        sample: false
      },
      groups: groups
    };

    return "/* 由网页「加歌」导出，可直接替换 data/songs.js */\n" +
      "window.PLAYLIST = " + JSON.stringify(payload, null, 2) + ";\n";
  }

  el.btnExport.addEventListener("click", function () {
    var text = buildExportText();
    var blob = new Blob(["\ufeff" + text], { type: "text/javascript;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "songs.js";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast("已导出 songs.js");
  });

  /* ============ 事件 ============ */
  el.search.addEventListener("input", function () {
    state.q = el.search.value;
    render();
  });

  el.clear.addEventListener("click", function () {
    el.search.value = "";
    state.q = "";
    render();
    el.search.focus();
  });

  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    var inDialog = el.dialog.hasAttribute("open");

    if (e.key === "/" && !typing && !inDialog) {
      if (e.preventDefault) e.preventDefault();
      el.search.focus();
      el.search.select();
    } else if (e.key === "Escape" && document.activeElement === el.search) {
      el.search.value = "";
      state.q = "";
      render();
      el.search.blur();
    }
  });

  /* ============ 启动 ============ */
  initTheme();
  renderChips(mergedGroups());
  render();

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      if (document.body.classList) document.body.classList.add("theme-ready");
    });
  });
})();
