const STORAGE_KEYS = {
  owner: "recipe_gh_owner",
  repo: "recipe_gh_repo",
  path: "recipe_gh_path",
  token: "recipe_gh_token"
};

let state = {
  data: { updatedAt: "", menus: [] },
  fileSha: null,
  category: "전체",
  search: "",
  sort: "rating",
  expandedMenus: new Set()
};

const els = {
  menuList: document.getElementById("menuList"),
  searchInput: document.getElementById("searchInput"),
  categoryTabs: document.getElementById("categoryTabs"),
  sortSelect: document.getElementById("sortSelect"),
  statusBanner: document.getElementById("statusBanner"),
  existingMenusList: document.getElementById("existingMenusList"),

  recipeModal: document.getElementById("recipeModal"),
  modalTitle: document.getElementById("modalTitle"),
  recipeForm: document.getElementById("recipeForm"),
  editMenuId: document.getElementById("editMenuId"),
  editRecipeId: document.getElementById("editRecipeId"),
  menuNameInput: document.getElementById("menuNameInput"),
  categoryInput: document.getElementById("categoryInput"),
  recipeTitleInput: document.getElementById("recipeTitleInput"),
  recipeUrlInput: document.getElementById("recipeUrlInput"),
  ratingInput: document.getElementById("ratingInput"),
  memoInput: document.getElementById("memoInput"),

  settingsModal: document.getElementById("settingsModal"),
  settingsForm: document.getElementById("settingsForm"),
  ghOwnerInput: document.getElementById("ghOwnerInput"),
  ghRepoInput: document.getElementById("ghRepoInput"),
  ghPathInput: document.getElementById("ghPathInput"),
  ghTokenInput: document.getElementById("ghTokenInput")
};

function getConfig() {
  return {
    owner: localStorage.getItem(STORAGE_KEYS.owner) || "",
    repo: localStorage.getItem(STORAGE_KEYS.repo) || "",
    path: localStorage.getItem(STORAGE_KEYS.path) || "data/recipes.json",
    token: localStorage.getItem(STORAGE_KEYS.token) || ""
  };
}

function showStatus(msg) {
  if (!msg) {
    els.statusBanner.textContent = "";
    els.statusBanner.classList.add("hidden");
    return;
  }
  els.statusBanner.textContent = msg;
  els.statusBanner.classList.remove("hidden");
}

function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "").split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const parts = u.pathname.split("/");
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx !== -1 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
  } catch (_) {
    return null;
  }
  return null;
}

function renderStars(rating) {
  const n = Math.max(1, Math.min(5, Number(rating) || 3));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// UTF-8 문자열을 Base64로 안전하게 변환
function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

// Base64를 UTF-8 문자열로 안전하게 디코딩
function fromBase64Utf8(base64) {
  const clean = base64.replace(/\n/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function loadRecipes() {
  const cfg = getConfig();
  showStatus("레시피를 불러오는 중...");

  try {
    if (cfg.owner && cfg.repo) {
      const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?t=${Date.now()}`;
      const headers = { Accept: "application/vnd.github+json" };
      if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

      const res = await fetch(apiUrl, { headers });
      if (!res.ok) throw new Error(`GitHub API 오류 (${res.status})`);
      const json = await res.json();
      state.fileSha = json.sha;
      state.data = JSON.parse(fromBase64Utf8(json.content));
      showStatus(
        cfg.token
          ? ""
          : "읽기 모드입니다. 추가·수정·저장을 하려면 [GitHub 설정]에서 PAT를 입력하세요."
      );
    } else {
      // GitHub 설정 전에는 동일 저장소의 정적 data/recipes.json 로드
      const res = await fetch(`${cfg.path}?t=${Date.now()}`);
      if (!res.ok) throw new Error("기본 recipes.json을 불러오지 못했습니다.");
      state.data = await res.json();
      showStatus(
        "샘플/정적 데이터 표시 중입니다. PC·폰에서 직접 저장하려면 [GitHub 설정]을 완료하세요."
      );
    }

    if (state.expandedMenus.size === 0 && state.data.menus.length > 0) {
      state.expandedMenus.add(state.data.menus[0].id);
    }
    syncMenuDatalist();
    render();
  } catch (err) {
    showStatus(`불러오기 실패: ${err.message}`);
  }
}

async function saveRecipesToGitHub() {
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    alert("저장하려면 [GitHub 설정]에서 Owner, Repo, PAT를 먼저 입력해주세요.");
    openSettingsModal();
    return false;
  }

  state.data.updatedAt = new Date().toISOString();
  const contentStr = JSON.stringify(state.data, null, 2) + "\n";
  const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;

  const body = {
    message: `Update recipes (${new Date().toISOString().slice(0, 10)})`,
    content: toBase64Utf8(contentStr)
  };
  if (state.fileSha) body.sha = state.fileSha;

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`저장 실패 (${res.status}): ${errText}`);
  }

  const result = await res.json();
  state.fileSha = result.content.sha;
  return true;
}

function syncMenuDatalist() {
  els.existingMenusList.innerHTML = state.data.menus
    .map((m) => `<option value="${escapeHtml(m.name)}"></option>`)
    .join("");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getFilteredMenus() {
  const q = state.search.trim().toLowerCase();

  return state.data.menus
    .filter((menu) => {
      if (state.category !== "전체" && menu.category !== state.category) {
        return false;
      }
      if (!q) return true;
      const inMenu = (menu.name || "").toLowerCase().includes(q);
      const inRecipes = (menu.recipes || []).some(
        (r) =>
          (r.title || "").toLowerCase().includes(q) ||
          (r.memo || "").toLowerCase().includes(q)
      );
      return inMenu || inRecipes;
    })
    .map((menu) => {
      const recipes = [...(menu.recipes || [])].sort((a, b) => {
        if (state.sort === "recent") {
          return (b.updatedAt || "").localeCompare(a.updatedAt || "");
        }
        return (b.rating || 0) - (a.rating || 0) || (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });
      const maxRating = recipes.reduce((acc, r) => Math.max(acc, Number(r.rating) || 0), 0);
      const latestDate = recipes.reduce(
        (acc, r) => ((r.updatedAt || "") > acc ? r.updatedAt : acc),
        ""
      );
      return { ...menu, recipes, maxRating, latestDate };
    })
    .sort((a, b) => {
      if (state.sort === "recent") {
        return (b.latestDate || "").localeCompare(a.latestDate || "");
      }
      return b.maxRating - a.maxRating;
    });
}

function render() {
  const menus = getFilteredMenus();

  if (menus.length === 0) {
    els.menuList.innerHTML = `<div class="menu-card">조건에 맞는 메뉴나 레시피가 없습니다.</div>`;
    return;
  }

  els.menuList.innerHTML = menus
    .map((menu) => {
      const isExpanded = state.expandedMenus.has(menu.id);
      return `
        <article class="menu-card">
          <div class="menu-header" data-toggle-menu="${escapeHtml(menu.id)}">
            <div class="menu-title-group">
              <h2 class="menu-title">${escapeHtml(menu.name)}</h2>
              <span class="badge">${escapeHtml(menu.category)}</span>
              <span class="badge">레시피 ${menu.recipes.length}개</span>
            </div>
            <div class="menu-meta">
              <span class="star">★ ${menu.maxRating || 0}</span>
              <span>${isExpanded ? "▲" : "▼"}</span>
            </div>
          </div>

          ${
            isExpanded
              ? `<div class="recipe-list">
                  ${menu.recipes.map((rec) => renderRecipeItem(menu.id, rec)).join("")}
                </div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function renderRecipeItem(menuId, rec) {
  const ytId = extractYouTubeId(rec.url);
  const thumbHtml = ytId
    ? `<img class="thumb" src="https://img.youtube.com/vi/${escapeHtml(ytId)}/hqdefault.jpg" alt="${escapeHtml(rec.title)}" loading="lazy" />`
    : "";

  const linkHtml = rec.url
    ? `<a class="link-btn" href="${escapeHtml(rec.url)}" target="_blank" rel="noopener noreferrer">원본 보기 ↗</a>`
    : `<span>링크 없음</span>`;

  return `
    <div class="recipe-item">
      ${thumbHtml}
      <div class="recipe-top">
        <h3 class="recipe-title">${escapeHtml(rec.title)}</h3>
        <span class="star" title="${rec.rating}점">${renderStars(rec.rating)}</span>
      </div>
      ${rec.memo ? `<p class="recipe-memo">${escapeHtml(rec.memo)}</p>` : ""}
      <div class="recipe-footer">
        <div>
          ${linkHtml}
          <span> · ${escapeHtml(rec.updatedAt || "")}</span>
        </div>
        <div class="action-links">
          <button class="mini-btn" data-edit-menu="${escapeHtml(menuId)}" data-edit-recipe="${escapeHtml(rec.id)}">수정</button>
          <button class="mini-btn danger" data-del-menu="${escapeHtml(menuId)}" data-del-recipe="${escapeHtml(rec.id)}">삭제</button>
        </div>
      </div>
    </div>
  `;
}

function openRecipeModal(menuId = "", recipeId = "") {
  els.recipeForm.reset();
  els.editMenuId.value = menuId;
  els.editRecipeId.value = recipeId;

  if (menuId && recipeId) {
    const menu = state.data.menus.find((m) => m.id === menuId);
    const rec = menu?.recipes.find((r) => r.id === recipeId);
    if (menu && rec) {
      els.modalTitle.textContent = "레시피 수정";
      els.menuNameInput.value = menu.name;
      els.categoryInput.value = menu.category;
      els.recipeTitleInput.value = rec.title;
      els.recipeUrlInput.value = rec.url || "";
      els.ratingInput.value = String(rec.rating || 5);
      els.memoInput.value = rec.memo || "";
    }
  } else {
    els.modalTitle.textContent = "레시피 추가";
    els.ratingInput.value = "5";
  }

  els.recipeModal.classList.remove("hidden");
}

function closeRecipeModal() {
  els.recipeModal.classList.add("hidden");
}

function openSettingsModal() {
  const cfg = getConfig();
  els.ghOwnerInput.value = cfg.owner;
  els.ghRepoInput.value = cfg.repo;
  els.ghPathInput.value = cfg.path;
  els.ghTokenInput.value = cfg.token;
  els.settingsModal.classList.remove("hidden");
}

function closeSettingsModal() {
  els.settingsModal.classList.add("hidden");
}

// 이벤트 바인딩
document.getElementById("openAddBtn").addEventListener("click", () => openRecipeModal());
document.getElementById("closeRecipeModal").addEventListener("click", closeRecipeModal);
document.getElementById("cancelRecipeModal").addEventListener("click", closeRecipeModal);

document.getElementById("openSettingsBtn").addEventListener("click", openSettingsModal);
document.getElementById("closeSettingsModal").addEventListener("click", closeSettingsModal);
document.getElementById("cancelSettingsModal").addEventListener("click", closeSettingsModal);

els.searchInput.addEventListener("input", (e) => {
  state.search = e.target.value;
  render();
});

els.sortSelect.addEventListener("change", (e) => {
  state.sort = e.target.value;
  render();
});

els.categoryTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  els.categoryTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  state.category = btn.dataset.category;
  render();
});

els.menuList.addEventListener("click", async (e) => {
  const toggleEl = e.target.closest("[data-toggle-menu]");
  if (toggleEl) {
    const id = toggleEl.dataset.toggleMenu;
    if (state.expandedMenus.has(id)) state.expandedMenus.delete(id);
    else state.expandedMenus.add(id);
    render();
    return;
  }

  const editBtn = e.target.closest("[data-edit-recipe]");
  if (editBtn) {
    openRecipeModal(editBtn.dataset.editMenu, editBtn.dataset.editRecipe);
    return;
  }

  const delBtn = e.target.closest("[data-del-recipe]");
  if (delBtn) {
    if (!confirm("이 레시피를 삭제할까요?")) return;
    const mId = delBtn.dataset.delMenu;
    const rId = delBtn.dataset.delRecipe;
    const menu = state.data.menus.find((m) => m.id === mId);
    if (!menu) return;

    const prevMenus = structuredClone(state.data.menus);
    menu.recipes = menu.recipes.filter((r) => r.id !== rId);
    if (menu.recipes.length === 0) {
      state.data.menus = state.data.menus.filter((m) => m.id !== mId);
    }

    try {
      showStatus("삭제 반영 중...");
      const ok = await saveRecipesToGitHub();
      if (!ok) {
        state.data.menus = prevMenus;
      } else {
        showStatus("저장 완료되었습니다.");
      }
      render();
    } catch (err) {
      state.data.menus = prevMenus;
      alert(err.message);
      showStatus("");
    }
  }
});

els.recipeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const menuName = els.menuNameInput.value.trim();
  const category = els.categoryInput.value;
  const title = els.recipeTitleInput.value.trim();
  const url = els.recipeUrlInput.value.trim();
  const rating = Number(els.ratingInput.value) || 5;
  const memo = els.memoInput.value.trim();
  const today = new Date().toISOString().slice(0, 10);

  const origMenuId = els.editMenuId.value;
  const origRecipeId = els.editRecipeId.value;

  const prevMenus = structuredClone(state.data.menus);

  // 기존 수정 시 원래 항목 제거 후 대상 메뉴에 재배치
  if (origMenuId && origRecipeId) {
    const oldMenu = state.data.menus.find((m) => m.id === origMenuId);
    if (oldMenu) {
      oldMenu.recipes = oldMenu.recipes.filter((r) => r.id !== origRecipeId);
      if (oldMenu.recipes.length === 0) {
        state.data.menus = state.data.menus.filter((m) => m.id !== origMenuId);
      }
    }
  }

  let targetMenu = state.data.menus.find(
    (m) => m.name.toLowerCase() === menuName.toLowerCase()
  );
  if (!targetMenu) {
    targetMenu = {
      id: `menu_${Date.now()}`,
      name: menuName,
      category,
      recipes: []
    };
    state.data.menus.push(targetMenu);
  } else {
    targetMenu.category = category;
  }

  targetMenu.recipes.push({
    id: origRecipeId || `rec_${Date.now()}`,
    title,
    url,
    rating,
    memo,
    updatedAt: today
  });

  state.expandedMenus.add(targetMenu.id);

  try {
    const btn = document.getElementById("saveRecipeBtn");
    btn.disabled = true;
    showStatus("GitHub에 저장 중...");
    const ok = await saveRecipesToGitHub();
    btn.disabled = false;

    if (!ok) {
      state.data.menus = prevMenus;
      return;
    }

    closeRecipeModal();
    syncMenuDatalist();
    render();
    showStatus("저장 완료되었습니다.");
  } catch (err) {
    document.getElementById("saveRecipeBtn").disabled = false;
    state.data.menus = prevMenus;
    alert(err.message);
    showStatus("");
  }
});

els.settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  localStorage.setItem(STORAGE_KEYS.owner, els.ghOwnerInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.repo, els.ghRepoInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.path, els.ghPathInput.value.trim() || "data/recipes.json");
  localStorage.setItem(STORAGE_KEYS.token, els.ghTokenInput.value.trim());
  closeSettingsModal();
  loadRecipes();
});

loadRecipes();