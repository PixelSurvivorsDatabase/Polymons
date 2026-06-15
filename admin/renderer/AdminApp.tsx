import {
  Activity,
  CalendarDays,
  Eye,
  Gamepad2,
  KeyRound,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Shirt,
  Tickets,
  UserRound,
  Users,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import logo from "../../assets/polymons-logo.png";

const PAGE_SIZE = 100;

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Login({
  onLogin,
}: {
  onLogin: (auth: PolyAdminAuth) => void;
}) {
  const [username, setUsername] = useState("lava");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await window.polyAdmin.login(username.trim(), password));
    } catch (nextError) {
      setError(readableError(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-lockup">
          <img src={logo} alt="" />
          <div>
            <span>Polymons internal tools</span>
            <h1>Poly Admin</h1>
          </div>
        </div>
        <p className="login-copy">
          Read-only account visibility for the Polymons owner.
        </p>
        <form onSubmit={submit}>
          <label>
            Owner username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="error-message">{error}</p>}
          <button className="primary-button" disabled={busy} type="submit">
            <ShieldCheck size={18} />
            {busy ? "Verifying owner access..." : "Open dashboard"}
          </button>
        </form>
        <div className="security-note">
          <LockKeyhole size={17} />
          <span>
            The app stores an encrypted session on this Windows account. It
            never contains the Supabase secret key.
          </span>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value.toLocaleString()}</strong>
      </div>
    </article>
  );
}

export default function AdminApp() {
  const [auth, setAuth] = useState<PolyAdminAuth | null>(null);
  const [loadedAuth, setLoadedAuth] = useState(false);
  const [data, setData] = useState<PolyAdminAccountsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inventoryBusy, setInventoryBusy] = useState("");
  const [inventoryMessage, setInventoryMessage] = useState("");
  const [tixMode, setTixMode] = useState<"add" | "set">("add");
  const [tixAmount, setTixAmount] = useState("10");
  const [tixBusy, setTixBusy] = useState(false);
  const [tixMessage, setTixMessage] = useState("");
  const [catalogSubmissions, setCatalogSubmissions] = useState<
    PolyAdminCatalogSubmission[]
  >([]);
  const [catalogBusy, setCatalogBusy] = useState("");
  const [catalogMessage, setCatalogMessage] = useState("");

  useEffect(() => {
    void window.polyAdmin.getAuth().then((current) => {
      setAuth(current);
      setLoadedAuth(true);
    });
  }, []);

  async function loadAccounts(nextPage = page) {
    setBusy(true);
    setError("");
    try {
      const result = await window.polyAdmin.listAccounts(nextPage, PAGE_SIZE);
      setData(result);
      setPage(result.pagination.page);
      setSelectedId((current) =>
        result.accounts.some((account) => account.id === current)
          ? current
          : result.accounts[0]?.id ?? null,
      );
    } catch (nextError) {
      setError(readableError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function loadCatalogSubmissions() {
    try {
      const result = await window.polyAdmin.listCatalogSubmissions();
      setCatalogSubmissions(result.submissions);
    } catch (nextError) {
      setError(readableError(nextError));
    }
  }

  useEffect(() => {
    if (auth) {
      void loadAccounts(1);
      void loadCatalogSubmissions();
    }
    // Loading is intentionally tied to the authenticated identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data?.accounts ?? [];
    return (data?.accounts ?? []).filter(
      (account) =>
        account.username.includes(normalized) ||
        account.displayName.toLowerCase().includes(normalized) ||
        account.id.toLowerCase().includes(normalized),
    );
  }, [data, query]);

  const selected =
    data?.accounts.find((account) => account.id === selectedId) ?? null;

  async function logout() {
    await window.polyAdmin.logout();
    setAuth(null);
    setData(null);
  }

  async function updateInventory(
    itemId: string,
    owned: boolean,
    equip = false,
  ) {
    if (!selected) return;
    setInventoryBusy(itemId);
    setInventoryMessage("");
    setError("");
    try {
      await window.polyAdmin.updateInventory(
        selected.id,
        itemId,
        owned,
        equip,
      );
      setInventoryMessage(
        equip
          ? "Item equipped."
          : owned
            ? "Item granted."
            : "Item removed.",
      );
      await loadAccounts(page);
    } catch (nextError) {
      setError(readableError(nextError));
    } finally {
      setInventoryBusy("");
    }
  }

  async function updateTix() {
    if (!selected) return;
    const amount = Number(tixAmount);
    if (!Number.isInteger(amount)) {
      setTixMessage("Enter a whole number.");
      return;
    }
    setTixBusy(true);
    setTixMessage("");
    setError("");
    try {
      const result = await window.polyAdmin.updateTix(
        selected.id,
        tixMode,
        amount,
      );
      setTixMessage(`Balance is now ${result.tix.toLocaleString()} Tix.`);
      await loadAccounts(page);
    } catch (nextError) {
      setError(readableError(nextError));
    } finally {
      setTixBusy(false);
    }
  }

  async function reviewCatalogSubmission(
    itemId: string,
    status: "approved" | "rejected",
  ) {
    const reason =
      status === "rejected"
        ? window.prompt("Reason shown to the creator?", "") ?? ""
        : "";
    setCatalogBusy(itemId);
    setCatalogMessage("");
    setError("");
    try {
      await window.polyAdmin.reviewCatalogSubmission(itemId, status, reason);
      setCatalogMessage(
        status === "approved" ? "Catalog item approved." : "Catalog item rejected.",
      );
      await Promise.all([loadCatalogSubmissions(), loadAccounts(page)]);
    } catch (nextError) {
      setError(readableError(nextError));
    } finally {
      setCatalogBusy("");
    }
  }

  if (!loadedAuth) {
    return <main className="loading-screen">Opening Poly Admin...</main>;
  }
  if (!auth) return <Login onLogin={setAuth} />;

  return (
    <div className="admin-shell">
      <header className="topbar">
        <div className="brand-lockup compact">
          <img src={logo} alt="" />
          <div>
            <span>Owner console</span>
            <h1>Poly Admin</h1>
          </div>
        </div>
        <div className="owner-chip">
          <ShieldCheck size={16} />
          Signed in as <strong>{auth.user.username}</strong>
        </div>
        <button className="quiet-button" onClick={() => void logout()}>
          <LogOut size={17} />
          Sign out
        </button>
      </header>

      <main className="dashboard">
        <section className="dashboard-heading">
          <div>
            <span className="eyebrow">Private platform overview</span>
            <h2>Accounts</h2>
            <p>
              View account metadata and platform activity without exposing
              credentials.
            </p>
          </div>
          <button
            className="primary-button small"
            disabled={busy}
            onClick={() => void loadAccounts()}
          >
            <RefreshCw className={busy ? "spin" : ""} size={17} />
            Refresh
          </button>
        </section>

        {data && (
          <section className="stat-grid">
            <StatCard
              icon={<Users size={20} />}
              label="Accounts"
              value={data.summary.accounts}
            />
            <StatCard
              icon={<Gamepad2 size={20} />}
              label="Games"
              value={data.summary.games}
            />
            <StatCard
              icon={<Eye size={20} />}
              label="Game visits"
              value={data.summary.gameVisits}
            />
            <StatCard
              icon={<Activity size={20} />}
              label="Online now"
              value={data.summary.onlinePlayers}
            />
          </section>
        )}

        {error && <p className="error-banner">{error}</p>}

        <section className="catalog-review-panel">
          <div className="inventory-heading">
            <Shirt size={18} />
            <div>
              <strong>Catalog review</strong>
              <span>Approve uploaded clothing before it reaches the public catalog.</span>
            </div>
          </div>
          {catalogMessage && <small>{catalogMessage}</small>}
          <div className="catalog-review-list">
            {catalogSubmissions.length === 0 ? (
              <div className="empty-state">No catalog submissions yet.</div>
            ) : (
              catalogSubmissions.map((item) => (
                <article key={item.id}>
                  {item.textureUrl ? <img src={item.textureUrl} alt="" /> : <span />}
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.itemType} · {item.priceTix.toLocaleString()} Tix ·{" "}
                      {item.creator
                        ? `@${item.creator.username}`
                        : "unknown creator"}
                    </span>
                    <small>{item.reviewStatus}</small>
                    {item.rejectionReason && <small>{item.rejectionReason}</small>}
                  </div>
                  <div className="inventory-actions">
                    <button
                      disabled={
                        catalogBusy === item.id || item.reviewStatus === "approved"
                      }
                      onClick={() =>
                        void reviewCatalogSubmission(item.id, "approved")
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="danger"
                      disabled={
                        catalogBusy === item.id || item.reviewStatus === "rejected"
                      }
                      onClick={() =>
                        void reviewCatalogSubmission(item.id, "rejected")
                      }
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="account-workspace">
          <div className="account-list-panel">
            <div className="list-toolbar">
              <label className="search-field">
                <Search size={17} />
                <input
                  placeholder="Search this page"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <span>{filteredAccounts.length} shown</span>
            </div>

            <div className="account-table">
              <div className="account-row account-head">
                <span>Player</span>
                <span>Role</span>
                <span>Joined</span>
                <span>Visits</span>
                <span>Status</span>
              </div>
              {filteredAccounts.map((account) => (
                <button
                  className={`account-row ${
                    account.id === selectedId ? "selected" : ""
                  }`}
                  key={account.id}
                  onClick={() => setSelectedId(account.id)}
                >
                  <span className="player-cell">
                    <span className="avatar">
                      {account.username.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{account.displayName}</strong>
                      <small>@{account.username}</small>
                    </span>
                  </span>
                  <span>
                    <span className={`role-badge ${account.role}`}>
                      {account.role}
                    </span>
                  </span>
                  <span>{new Date(account.joinedAt).toLocaleDateString()}</span>
                  <span>{account.stats.gameVisits.toLocaleString()}</span>
                  <span>
                    <span
                      className={`status-dot ${
                        account.online.connected ? "online" : ""
                      }`}
                    />
                    {account.online.connected ? "Online" : "Offline"}
                  </span>
                </button>
              ))}
              {!busy && filteredAccounts.length === 0 && (
                <div className="empty-state">No matching accounts.</div>
              )}
            </div>

            {data && (
              <div className="pagination">
                <button
                  disabled={busy || page <= 1}
                  onClick={() => void loadAccounts(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {data.pagination.lastPage}
                </span>
                <button
                  disabled={busy || page >= data.pagination.lastPage}
                  onClick={() => void loadAccounts(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <aside className="account-detail">
            {selected ? (
              <>
                <div className="detail-identity">
                  <span className="avatar large">
                    {selected.username.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <span className={`role-badge ${selected.role}`}>
                      {selected.role}
                    </span>
                    <h3>{selected.displayName}</h3>
                    <p>@{selected.username}</p>
                  </div>
                </div>

                <div className="detail-stats">
                  <div>
                    <Users size={17} />
                    <strong>{selected.stats.friends}</strong>
                    <span>Friends</span>
                  </div>
                  <div>
                    <Gamepad2 size={17} />
                    <strong>{selected.stats.games}</strong>
                    <span>Games</span>
                  </div>
                  <div>
                    <Eye size={17} />
                    <strong>{selected.stats.gameVisits}</strong>
                    <span>Visits</span>
                  </div>
                  <div>
                    <Tickets size={17} />
                    <strong>{selected.tix.toLocaleString()}</strong>
                    <span>Tix</span>
                  </div>
                </div>

                <section className="tix-editor">
                  <div className="inventory-heading">
                    <Tickets size={18} />
                    <div>
                      <strong>Edit Tix</strong>
                      <span>Add to the balance or set an exact amount.</span>
                    </div>
                  </div>
                  <div className="tix-editor-controls">
                    <select
                      value={tixMode}
                      onChange={(event) =>
                        setTixMode(event.target.value as "add" | "set")
                      }
                    >
                      <option value="add">Add Tix</option>
                      <option value="set">Set balance</option>
                    </select>
                    <input
                      type="number"
                      step="1"
                      value={tixAmount}
                      onChange={(event) => setTixAmount(event.target.value)}
                    />
                    <button disabled={tixBusy} onClick={() => void updateTix()}>
                      {tixBusy ? "Saving..." : "Apply"}
                    </button>
                  </div>
                  {tixMessage && <small>{tixMessage}</small>}
                </section>

                <dl className="detail-list">
                  <div>
                    <dt>
                      <CalendarDays size={16} />
                      Joined
                    </dt>
                    <dd>{formatDate(selected.joinedAt)}</dd>
                  </div>
                  <div>
                    <dt>
                      <UserRound size={16} />
                      Last sign-in
                    </dt>
                    <dd>{formatDate(selected.lastSignInAt)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Activity size={16} />
                      Current status
                    </dt>
                    <dd>
                      {selected.online.connected
                        ? `Online in ${selected.online.gameId}`
                        : "Offline"}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <KeyRound size={16} />
                      Account ID
                    </dt>
                    <dd className="mono">{selected.id}</dd>
                  </div>
                </dl>

                <div className="password-card">
                  <LockKeyhole size={19} />
                  <div>
                    <strong>Password protected</strong>
                    <p>
                      Passwords are one-way hashes and cannot be viewed by
                      Polymons or Poly Admin.
                    </p>
                  </div>
                </div>

                <section className="inventory-editor">
                  <div className="inventory-heading">
                    <Shirt size={18} />
                    <div>
                      <strong>Avatar inventory</strong>
                      <span>Grant, remove, or equip catalog items.</span>
                    </div>
                  </div>
                  <div className="inventory-list">
                    {(data?.avatarItems ?? []).map((item) => {
                      const owned = selected.inventory.some(
                        (entry) => entry.itemId === item.id,
                      );
                      const equipped =
                        item.itemType === "pants"
                          ? selected.equippedPantsId === item.id
                          : selected.equippedShirtId === item.id;
                      return (
                        <article key={item.id}>
                          <div>
                            <strong>{item.name}</strong>
                            <span>{item.description}</span>
                            {equipped && <small>Equipped</small>}
                          </div>
                          <div className="inventory-actions">
                            {owned && !equipped && (
                              <button
                                disabled={inventoryBusy === item.id}
                                onClick={() =>
                                  void updateInventory(item.id, true, true)
                                }
                              >
                                Equip
                              </button>
                            )}
                            <button
                              className={owned ? "danger" : ""}
                              disabled={inventoryBusy === item.id}
                              onClick={() =>
                                void updateInventory(item.id, !owned)
                              }
                            >
                              {inventoryBusy === item.id
                                ? "Saving..."
                                : owned
                                  ? "Remove"
                                  : "Grant"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {inventoryMessage && (
                    <small className="inventory-message">
                      {inventoryMessage}
                    </small>
                  )}
                </section>

                {selected.loginDisabled && (
                  <div className="warning-card">
                    Login is disabled for this account.
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">Select an account.</div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
