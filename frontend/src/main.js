import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const ROLE_LABELS = { admin: "管理员", worker: "操作工" };

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof data.detail === "string" ? data.detail : "请求失败");
    err.status = res.status;
    throw err;
  }
  return data;
}

function rowLabelOf(pit) {
  const head = (pit.code || "").split("-")[0].trim();
  return head ? `${head}排` : `第${pit.row + 1}排`;
}

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    view: { type: String },
    me: { type: Object },
    board: { type: Object },
    perms: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .topbar {
      display: flex; align-items: center; gap: 10px;
      background: #3a2c1e; color: #f3e9d7; padding: 10px 18px;
    }
    .topbar .brand { font-size: 1.15em; font-weight: bold; margin-right: 12px; }
    .topbar nav button {
      font: inherit; color: #e8dcc4; background: transparent; border: 1px solid #7a6549;
      border-radius: 6px; padding: 6px 14px; cursor: pointer;
    }
    .topbar nav button.on { background: #8a5a2b; border-color: #8a5a2b; color: #fff; }
    .topbar .spacer { flex: 1; }
    .topbar .who { font-size: 0.92em; color: #d8c9ae; }
    .topbar .ghost {
      font: inherit; color: #e8dcc4; background: transparent; border: 0; cursor: pointer;
      text-decoration: underline;
    }
    .wrap { max-width: 880px; margin: 0 auto; padding: 28px 16px 50px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; font: inherit; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .pit.locked { opacity: 0.45; cursor: not-allowed; }
    .err { color: #9b1c1c; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, button { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    button:disabled, input:disabled { opacity: 0.5; cursor: not-allowed; }
    .overlay { position: fixed; inset: 0; background: rgba(30, 20, 10, 0.35); }
    .drawer {
      position: fixed; top: 0; right: 0; width: 320px; height: 100%;
      background: #f7f1e6; padding: 22px 18px; box-shadow: -4px 0 14px rgba(0, 0, 0, 0.25);
      overflow-y: auto;
    }
    .drawer .close {
      float: right; border: 0; background: transparent; font-size: 1.3em; cursor: pointer; color: #6b5a48;
    }
    .lockhint {
      background: #efe3cc; border: 1px solid #cbb27f; border-radius: 6px;
      padding: 10px 12px; color: #7a5a1e;
    }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #cbb27f; padding: 8px 10px; text-align: left; }
    th { background: #efe3cc; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.view = "map";
    this.me = null;
    this.board = null;
    this.perms = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) this.boot();
  }

  get phOk() {
    const t = (this.ph || "").trim();
    return t !== "" && Number.isFinite(Number(t));
  }

  async boot() {
    try {
      this.me = await api("/api/auth/me");
      await this.refresh();
    } catch (e) {
      if (e.status === 401 || e.status === 403) this.logout();
      else this.err = e.message;
    }
  }

  async refresh() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || null;
      }
    } catch (e) {
      if (e.status === 401) this.logout();
      else this.err = e.message;
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
      this.me = data.user;
      this.ready = true;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.ready = false;
    this.view = "map";
    this.me = null;
    this.board = null;
    this.perms = null;
    this.picked = null;
    this.err = "";
  }

  async openPerms() {
    this.view = "perms";
    this.err = "";
    try {
      this.perms = await api("/api/permissions");
    } catch (e) {
      this.err = e.message;
    }
  }

  async mutate(path, body) {
    this.err = "";
    try {
      this.picked = await api(path, { method: "POST", body: JSON.stringify(body) });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
      if (ex.status === 409) await this.refresh();
    }
  }

  async writePh() {
    if (!this.phOk) {
      this.err = "请填写 0～14 的酸碱度数字";
      return;
    }
    await this.mutate(`/api/pits/${this.picked.id}/samples`, {
      ph: Number(this.ph),
      version: this.picked.version,
    });
  }

  async setStatus(status) {
    await this.mutate(`/api/pits/${this.picked.id}/status`, {
      status,
      version: this.picked.version,
    });
  }

  renderTopbar() {
    return html`<header class="topbar">
      <span class="brand">南冈鞣场</span>
      <nav>
        <button class=${this.view === "map" ? "on" : ""} @click=${() => (this.view = "map")}>坑位场地图</button>
        <button class=${this.view === "perms" ? "on" : ""} @click=${this.openPerms}>西排权限</button>
      </nav>
      <span class="spacer"></span>
      ${this.me ? html`<span class="who">${this.me.username} · ${ROLE_LABELS[this.me.role] || this.me.role}</span>` : ""}
      <button class="ghost" @click=${this.logout}>退出</button>
    </header>`;
  }

  renderMap() {
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`<div class="wrap">
      <p>${this.board.village} · 点坑开抽屉登记浸液酸碱度；放液须最近读数 3.5～5.0</p>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status} ${p.editable ? "" : "locked"}" @click=${() => (this.picked = p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}${p.editable ? "" : html`<br />🔒`}
          </button>`
        )}
      </div>
      ${this.picked ? this.renderDrawer() : ""}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  renderDrawer() {
    const p = this.picked;
    return html`<div class="overlay" @click=${() => (this.picked = null)}></div>
      <aside class="drawer">
        <button class="close" @click=${() => (this.picked = null)}>×</button>
        <h3>${p.code} · ${LABELS[p.status]}</h3>
        <p>最近酸碱度：${p.latestPh ?? "无"} · 共 ${p.sampleCount} 次记录</p>
        ${p.editable
          ? html`<label>浸液酸碱度
                <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
              </label>
              <button ?disabled=${!this.phOk} @click=${this.writePh}>登记酸碱度</button>
              <div>
                <button @click=${() => this.setStatus("fill")}>注液</button>
                <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
                <button @click=${() => this.setStatus("drained")}>已放液</button>
              </div>`
          : html`<p class="lockhint">${rowLabelOf(p)}仅管理员可改，操作工只能查看。</p>`}
      </aside>`;
  }

  renderPerms() {
    const rows = this.perms ? this.perms.rows : [];
    return html`<div class="wrap">
      <h2>西排权限 · 名单只读</h2>
      <p class="hint">名单列出每排谁能改；空名单的排操作工不可改，管理员不受此限。</p>
      ${this.perms
        ? html`<table>
            <thead>
              <tr><th>排</th><th>坑位</th><th>可改名单</th><th>说明</th></tr>
            </thead>
            <tbody>
              ${rows.map(
                (r) => html`<tr>
                  <td>${r.label}</td>
                  <td>${r.codes.join("、")}</td>
                  <td>${r.names.length ? r.names.join("、") : "（空）"}</td>
                  <td>${r.note}</td>
                </tr>`
              )}
            </tbody>
          </table>`
        : html`<p>${this.err || "装载名单…"}</p>`}
      ${this.err && this.perms ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  render() {
    if (!this.ready) {
      return html`<div class="wrap">
        <h1>南冈鞣场</h1>
        <form @submit=${this.login} autocomplete="off">
          <label>用户名
            <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
          </label>
          <label>密码
            <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
          </label>
          <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
          <button>登录</button>
        </form>
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      </div>`;
    }
    return html`${this.renderTopbar()}${this.view === "map" ? this.renderMap() : this.renderPerms()}`;
  }
}

customElements.define("tan-yard", TanYard);
