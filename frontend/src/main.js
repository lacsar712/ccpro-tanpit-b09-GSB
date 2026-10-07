import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const ROLE_KEY = "tanpit_role";
const NAME_KEY = "tanpit_name";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const PAGE_BOARD = "board";
const PAGE_GRANTS = "grants";

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || "请求失败");
    err.status = res.status;
    throw err;
  }
  return data;
}

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    page: { type: String },
    board: { type: Object },
    grants: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
    role: { type: String },
    name: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 28px 16px 50px; }
    .topbar { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #8a5a2b; padding-bottom: 10px; margin-bottom: 16px; }
    .topbar h1 { font-size: 1.3em; margin: 0; }
    .tabs { display: flex; gap: 8px; }
    .tab { padding: 6px 14px; border: 1px solid #8a5a2b; background: #f3ead9; cursor: pointer; border-radius: 6px; }
    .tab[aria-selected="true"] { background: #8a5a2b; color: #fff; }
    .spacer { flex: 1; }
    .who { color: #6b5a48; font-size: 0.92em; }
    .logout { padding: 4px 10px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .rowline { grid-column: 1 / -1; margin: 10px 0 0; color: #6b5a48; border-bottom: 1px dashed #c9b79c; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .pit.locked { cursor: not-allowed; opacity: 0.72; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .blocked { color: #9b1c1c; border: 1px solid #d9a3a3; background: #fbeeee; padding: 8px 10px; border-radius: 6px; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, button { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    table { border-collapse: collapse; width: 100%; background: #fbf7ef; }
    th, td { border: 1px solid #c9b79c; padding: 8px 10px; text-align: left; }
    th { background: #ecdcc2; }
    .yes { color: #38651f; }
    .no { color: #9b1c1c; }
    .empty { color: #9b1c1c; }
    .readonly-tag { color: #6b5a48; font-size: 0.9em; margin-left: 8px; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.page = PAGE_BOARD;
    this.board = null;
    this.grants = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
    this.role = localStorage.getItem(ROLE_KEY) || "";
    this.name = localStorage.getItem(NAME_KEY) || "";
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) this.openPage(this.page);
  }

  get isWorker() {
    return this.role === "worker";
  }

  // 西排：行号 2；且名单里该列必须挂了操作工，空名列也不得改
  canEdit(p) {
    if (!this.isWorker) return true;
    return p.row === 2 && Boolean(p.assignee);
  }

  blockReason(p) {
    if (!this.isWorker) return "";
    if (p.row !== 2) {
      return `操作工只能改西排坑位，${p.code} 属${p.rowName}，已被挡下；请找管理员处理。`;
    }
    if (!p.assignee) {
      return `${p.code} 所在列为西排权限名单中的空名列，未指定操作工，不能改。`;
    }
    return "";
  }

  async openPage(page) {
    this.page = page;
    this.err = "";
    try {
      if (page === PAGE_BOARD) await this.loadBoard();
      if (page === PAGE_GRANTS) await this.loadGrants();
    } catch (e) {
      this.err = e.message;
    }
  }

  async loadBoard() {
    this.board = await api("/api/board");
    if (this.picked) {
      this.picked = this.board.pits.find((p) => p.id === this.picked.id) || null;
    }
  }

  async loadGrants() {
    // 专页名单只读：本接口只 GET，前端不提供任何改派控件
    this.grants = await api("/api/grants");
  }

  async refresh() {
    try {
      await this.loadBoard();
    } catch (e) {
      this.err = e.message;
    }
  }

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(ROLE_KEY, data.user.role);
      localStorage.setItem(NAME_KEY, data.user.username);
      this.role = data.user.role;
      this.name = data.user.username;
      this.ready = true;
      this.page = PAGE_BOARD;
      await this.loadBoard();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(NAME_KEY);
    this.ready = false;
    this.board = null;
    this.grants = null;
    this.picked = null;
    this.role = "";
    this.name = "";
  }

  pick(p) {
    // 工人点东排/中排：可以开抽屉看，但所有改动控件禁用并给中文说明
    this.picked = p;
    this.err = "";
  }

  async writePh() {
    this.err = "";
    const value = Number(this.ph);
    if (this.ph.trim() === "" || !Number.isFinite(value)) {
      this.err = "酸碱度不能为空，西排权限不允许放空酸碱过关";
      return;
    }
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: value, expected: this.picked.version }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
      if (ex.status === 409) await this.refresh();
    }
  }

  async setStatus(status) {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, expected: this.picked.version }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
      if (ex.status === 409) await this.refresh();
    }
  }

  renderLogin() {
    return html`<div class="wrap">
      <h1>南冈鞣场</h1>
      <form @submit=${this.login} autocomplete="off">
        <label>用户名
          <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
        </label>
        <label>密码
          <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456（操作工只管西排）</p>
        <button>登录</button>
      </form>
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  renderTopbar() {
    return html`<nav class="topbar">
      <h1>南冈鞣场</h1>
      <div class="tabs">
        <button class="tab" aria-selected=${this.page === PAGE_BOARD} @click=${() => this.openPage(PAGE_BOARD)}>坑位场地图</button>
        <button class="tab" aria-selected=${this.page === PAGE_GRANTS} @click=${() => this.openPage(PAGE_GRANTS)}>西排权限</button>
      </div>
      <span class="spacer"></span>
      <span class="who">${this.name} · ${this.isWorker ? "操作工" : "管理员"}</span>
      <button class="logout" @click=${this.logout}>退出</button>
    </nav>`;
  }

  renderBoard() {
    if (!this.board) return html`${this.err || "装载坑位…"}`;
    const rows = [
      { row: 0, label: "东排" },
      { row: 1, label: "中排" },
      { row: 2, label: "西排（操作工责任排）" },
    ];
    return html`
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0</p>
      <div class="grid">
        ${rows.map(
          (r) => html`
            <h3 class="rowline">${r.label}</h3>
            ${this.board.pits
              .filter((p) => p.row === r.row)
              .map(
                (p) => html`<button
                  class="pit ${p.status} ${this.canEdit(p) ? "" : "locked"}"
                  @click=${() => this.pick(p)}
                >
                  <strong>${p.code}</strong><br />${LABELS[p.status]}<br />
                  责任人：${p.assignee || "空名"}
                </button>`
              )}
          `
        )}
      </div>
      ${this.picked ? this.renderDrawer() : ""}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    `;
  }

  renderDrawer() {
    const p = this.picked;
    const editable = this.canEdit(p);
    const reason = this.blockReason(p);
    return html`<section>
      <h3>${p.code} · ${p.rowName}第 ${p.col + 1} 列 · ${LABELS[p.status]}</h3>
      <p>最近酸碱度：${p.latestPh ?? "无"} · ${p.sampleCount} 次 · 名单责任人：${p.assignee || "空名"}</p>
      ${!editable
        ? html`<p class="blocked">${reason}此处只能查看，改动请用管理员账号。</p>`
        : ""}
      <input
        .value=${this.ph}
        ?disabled=${!editable}
        @input=${(e) => (this.ph = e.target.value)}
      />
      <button ?disabled=${!editable} @click=${this.writePh}>登记酸碱度</button>
      <div>
        <button ?disabled=${!editable} @click=${() => this.setStatus("fill")}>注液</button>
        <button ?disabled=${!editable} @click=${() => this.setStatus("tanning")}>鞣制中</button>
        <button ?disabled=${!editable} @click=${() => this.setStatus("drained")}>已放液</button>
      </div>
    </section>`;
  }

  renderGrants() {
    if (!this.grants) return html`${this.err || "装载名单…"}`;
    // 操作工打开本页同样只读：表格无任何输入框、无改派按钮
    return html`
      <h2>西排权限专页<span class="readonly-tag">名单只读${this.isWorker ? " · 操作工仅可查看" : ""}</span></h2>
      <p class="hint">列出谁能改哪列。操作工只能给名单中挂名的西排列写酸碱度或改坑态；东排、中排一律挡下。</p>
      <table>
        <thead>
          <tr><th>排别</th><th>列号</th><th>坑号</th><th>可改人（名单）</th><th>操作工可否改</th></tr>
        </thead>
        <tbody>
          ${this.grants.rows.map(
            (r) => html`<tr>
              <td>${r.rowName}</td>
              <td>第 ${r.col + 1} 列</td>
              <td>${r.code}</td>
              <td class=${r.assignee ? "" : "empty"}>${r.assignee ? r.assignee : "空名（未指派）"}</td>
              <td class=${r.workerEditable ? "yes" : "no"}>${r.workerEditable ? "可以" : "不可以"}</td>
            </tr>`
          )}
        </tbody>
      </table>
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    `;
  }

  render() {
    if (!this.ready) return this.renderLogin();
    return html`<div class="wrap">
      ${this.renderTopbar()}
      ${this.page === PAGE_BOARD ? this.renderBoard() : this.renderGrants()}
    </div>`;
  }
}

customElements.define("tan-yard", TanYard);
