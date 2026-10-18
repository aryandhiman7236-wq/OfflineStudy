
import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp
} from "./firebase.js";

const app = document.createElement("section");
app.id = "shared-study-app";
document.body.appendChild(app);

const style = document.createElement("style");
style.textContent = `
#shared-study-app {
  --ink:#172033; --muted:#687386; --line:#e8edf4;
  --blue:#4f46e5; --pale:#f5f7ff;
  font-family:Inter,system-ui,-apple-system,sans-serif;
  color:var(--ink); background:#f7f8fc;
  margin:32px auto; max-width:1150px; padding:20px;
  border:1px solid var(--line); border-radius:24px;
  box-sizing:border-box;
}
#shared-study-app * {box-sizing:border-box}
#shared-study-app button,
#shared-study-app input {font:inherit}
#shared-study-app button {cursor:pointer}
.sv-top {display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.sv-brand {display:flex;align-items:center;gap:12px}
.sv-logo {background:#202944;color:white;border-radius:13px;padding:12px;font-weight:800}
.sv-muted {color:var(--muted);font-size:13px}
.sv-user {font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.sv-nav {display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}
.sv-nav button,.sv-btn {
 border:1px solid var(--line);background:white;border-radius:12px;
 padding:11px 15px;color:var(--ink);font-weight:650
}
.sv-nav button.active,.sv-btn.primary {background:var(--blue);color:white;border-color:var(--blue)}
.sv-hero {padding:25px;border-radius:20px;background:linear-gradient(120deg,#eef0ff,#fff);margin-bottom:22px}
.sv-hero h2 {font-size:clamp(23px,4vw,34px);margin:8px 0}
.sv-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.sv-card {background:white;border:1px solid var(--line);border-radius:18px;padding:20px;min-width:0}
.sv-card h3 {margin:0 0 8px}
.sv-card p {color:var(--muted);line-height:1.55}
.sv-form {display:grid;gap:12px;max-width:520px}
.sv-form input {width:100%;padding:13px;border:1px solid #dce2ec;border-radius:12px;background:white}
.sv-list {display:grid;gap:12px;margin-top:16px}
.sv-dash {display:flex;align-items:center;justify-content:space-between;gap:12px}
.sv-code {display:inline-block;background:#eef0ff;color:#3730a3;padding:6px 10px;border-radius:8px;font-weight:800;letter-spacing:2px}
.sv-msg {margin:14px 0;padding:12px 14px;background:#fff7df;border-radius:12px;color:#76520a;overflow-wrap:anywhere}
.sv-msg:empty {display:none}
.sv-row {display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sv-divider {height:1px;background:var(--line);margin:18px 0}
.sv-small {font-size:12px;color:var(--muted)}
@media(max-width:650px){
 #shared-study-app{margin:16px 8px;padding:13px;border-radius:18px}
 .sv-grid{grid-template-columns:1fr}
 .sv-hero{padding:18px}
 .sv-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
 .sv-nav button{width:100%;padding:12px 8px}
 .sv-dash{align-items:flex-start;flex-direction:column}
}
`;
document.head.appendChild(style);

let currentUser = null;
let activePage = "home";
let selectedDashboard = null;
let myDashboards = [];
let busy = false;

app.innerHTML = `
  <header class="sv-top">
    <div class="sv-brand">
      <div class="sv-logo">SV</div>
      <div>
        <strong>Study Vault</strong>
        <div class="sv-muted">Your study space, together.</div>
      </div>
    </div>
    <div class="sv-row">
      <span id="sv-user" class="sv-user">Checking account…</span>
      <button id="sv-logout" class="sv-btn" hidden>Log out</button>
    </div>
  </header>

  <nav class="sv-nav" aria-label="Study dashboard navigation">
    <button data-page="home" class="active">⌂ Home</button>
    <button data-page="create">＋ Create</button>
    <button data-page="join">↗ Join</button>
    <button data-page="account">♙ Account</button>
  </nav>

  <div id="sv-message" class="sv-msg" role="status"></div>
  <main id="sv-content" aria-live="polite"></main>
`;

const content = document.getElementById("sv-content");
const message = document.getElementById("sv-message");
const userLabel = document.getElementById("sv-user");
const logoutButton = document.getElementById("sv-logout");

function showMessage(text = "") {
  message.textContent = text;
}

function safeText(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function setPage(page) {
  activePage = page;
  document.querySelectorAll("#shared-study-app [data-page]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  showMessage("");
  renderPage();
}

document.querySelectorAll("#shared-study-app [data-page]").forEach(btn => {
  btn.addEventListener("click", () => setPage(btn.dataset.page));
});

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    selectedDashboard = null;
    showMessage("You have been logged out.");
  } catch (error) {
    showMessage(error.message);
  }
});

function requireLogin() {
  if (currentUser) return true;
  showMessage("Please sign in or create an account first.");
  setPage("account");
  return false;
}

async function refreshDashboards() {
  if (!currentUser) {
    myDashboards = [];
    return;
  }

  const ownedQuery = query(
    collection(db, "dashboards"),
    where("ownerUid", "==", currentUser.uid)
  );

  const ownedSnapshot = await getDocs(ownedQuery);
  const owned = ownedSnapshot.docs.map(item => ({
    id: item.id,
    ...item.data(),
    role: "Admin"
  }));

  const memberSnapshot = await getDocs(
    collection(db, "userDashboards", currentUser.uid, "items")
  );

  const joined = memberSnapshot.docs.map(item => ({
    id: item.id,
    ...item.data(),
    role: item.data().role || "Member"
  }));

  const unique = new Map();
  [...owned, ...joined].forEach(item => unique.set(item.id, item));
  myDashboards = [...unique.values()];
}

function renderPage() {
  if (activePage === "account") return renderAccount();
  if (!currentUser) {
    content.innerHTML = `
      <section class="sv-hero">
        <div class="sv-muted">WELCOME TO YOUR STUDY SPACE</div>
        <h2>Keep your study material organised.</h2>
        <p>Sign in to create a dashboard or request access to a friend's dashboard.</p>
        <button class="sv-btn primary" id="sv-go-account">Sign in / Sign up</button>
      </section>`;
    document.getElementById("sv-go-account").onclick = () => setPage("account");
    return;
  }

  if (activePage === "create") return renderCreate();
  if (activePage === "join") return renderJoin();
  if (activePage === "details") return renderDetails();

  renderHome();
}

function renderAccount() {
  if (currentUser) {
    content.innerHTML = `
      <section class="sv-hero">
        <div class="sv-muted">YOUR ACCOUNT</div>
        <h2>You're signed in 👋</h2>
        <p>${safeText(currentUser.email)}</p>
        <button class="sv-btn primary" id="sv-account-home">Go to Home</button>
      </section>`;
    document.getElementById("sv-account-home").onclick = () => setPage("home");
    return;
  }

  content.innerHTML = `
    <section class="sv-hero">
      <div class="sv-muted">STUDY VAULT ACCOUNT</div>
      <h2>Welcome back.</h2>
      <p>Sign in or create an account to continue.</p>
    </section>
    <section class="sv-grid">
      <div class="sv-card">
        <h3>Sign in</h3>
        <form id="sv-login" class="sv-form">
          <input name="email" type="email" placeholder="Email address" required autocomplete="email">
          <input name="password" type="password" placeholder="Password" required autocomplete="current-password">
          <button class="sv-btn primary" type="submit">Sign in</button>
        </form>
      </div>
      <div class="sv-card">
        <h3>Create account</h3>
        <form id="sv-signup" class="sv-form">
          <input name="email" type="email" placeholder="Email address" required autocomplete="email">
          <input name="password" type="password" placeholder="At least 6 characters" required minlength="6" autocomplete="new-password">
          <button class="sv-btn primary" type="submit">Create account</button>
        </form>
      </div>
    </section>`;

  document.getElementById("sv-login").onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const form = new FormData(event.currentTarget);
      await signInWithEmailAndPassword(
        auth, form.get("email"), form.get("password")
      );
      showMessage("Signed in successfully.");
    } catch (error) {
      showMessage(error.message);
    } finally {
      busy = false;
    }
  };

  document.getElementById("sv-signup").onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const form = new FormData(event.currentTarget);
      await createUserWithEmailAndPassword(
        auth, form.get("email"), form.get("password")
      );
      showMessage("Account created successfully.");
    } catch (error) {
      showMessage(error.message);
    } finally {
      busy = false;
    }
  };
}

function renderHome() {
  content.innerHTML = `
    <section class="sv-hero">
      <div class="sv-muted">YOUR LEARNING SPACE</div>
      <h2>Study smarter, together.</h2>
      <p>Create a space for your notes, or join one shared by your friends.</p>
      <div class="sv-row">
        <button class="sv-btn primary" id="sv-home-create">＋ Create dashboard</button>
        <button class="sv-btn" id="sv-home-join">Join with code</button>
      </div>
    </section>
    <div class="sv-row" style="justify-content:space-between">
      <div><h2 style="margin:0">My dashboards</h2><p class="sv-muted">Your created and approved spaces</p></div>
      <button class="sv-btn" id="sv-refresh">↻ Refresh</button>
    </div>
    <div id="sv-dashboard-list" class="sv-list">
      <div class="sv-card">Loading dashboards…</div>
    </div>`;

  document.getElementById("sv-home-create").onclick = () => setPage("create");
  document.getElementById("sv-home-join").onclick = () => setPage("join");
  document.getElementById("sv-refresh").onclick = async () => {
    try {
      await refreshDashboards();
      renderHome();
    } catch (error) {
      showMessage("Could not load dashboards. Check Firestore rules: " + error.message);
    }
  };

  const list = document.getElementById("sv-dashboard-list");
  if (!myDashboards.length) {
    list.innerHTML = `
      <div class="sv-card">
        <h3>No dashboards yet</h3>
        <p>Create your first dashboard, or enter a friend's code to request access.</p>
      </div>`;
    return;
  }

  list.innerHTML = myDashboards.map(item => `
    <article class="sv-card sv-dash">
      <div>
        <h3>${safeText(item.name || "Untitled dashboard")}</h3>
        <div class="sv-muted">${safeText(item.role || "Member")}</div>
        ${item.code ? `<p>Join code: <span class="sv-code">${safeText(item.code)}</span></p>` : ""}
      </div>
      <button class="sv-btn primary" data-open="${safeText(item.id)}">Open dashboard →</button>
    </article>
  `).join("");

  list.querySelectorAll("[data-open]").forEach(button => {
    button.onclick = () => {
      selectedDashboard = myDashboards.find(item => item.id === button.dataset.open);
      setPage("details");
    };
  });
}

function renderCreate() {
  content.innerHTML = `
    <section class="sv-hero">
      <div class="sv-muted">NEW SHARED SPACE</div>
      <h2>Create a dashboard</h2>
      <p>Choose a clear name. For example, Study Material, BBA Notes or Exam Prep.</p>
    </section>
    <section class="sv-card">
      <form id="sv-create-form" class="sv-form">
        <label for="sv-dashboard-name"><strong>Dashboard name</strong></label>
        <input id="sv-dashboard-name" name="name" maxlength="60" placeholder="e.g. Study Material" required>
        <button class="sv-btn primary" type="submit">Create dashboard</button>
      </form>
      <p class="sv-small">You will be the admin and can review join requests.</p>
    </section>`;

  document.getElementById("sv-create-form").onsubmit = async event => {
    event.preventDefault();
    if (!requireLogin() || busy) return;
    busy = true;

    try {
      const form = new FormData(event.currentTarget);
      const name = String(form.get("name") || "").trim();
      if (!name) throw new Error("Please enter a dashboard name.");

      let code = "";
      let codeRef = null;

      // Generate a six-digit code and check for an unused one.
      for (let attempt = 0; attempt < 10; attempt++) {
        code = String(Math.floor(100000 + Math.random() * 900000));
        codeRef = doc(db, "dashboardCodes", code);
        const existing = await getDoc(codeRef);
        if (!existing.exists()) break;
        code = "";
      }

      if (!code || !codeRef) {
        throw new Error("Could not generate a unique code. Please try again.");
      }

      const dashboardRef = doc(collection(db, "dashboards"));
      await setDoc(dashboardRef, {
        name,
        ownerUid: currentUser.uid,
        createdAt: serverTimestamp(),
        code
      });

      await setDoc(codeRef, {
        dashboardId: dashboardRef.id,
        ownerUid: currentUser.uid,
        name,
        createdAt: serverTimestamp()
      });

      await setDoc(
        doc(db, "dashboards", dashboardRef.id, "members", currentUser.uid),
        {
          uid: currentUser.uid,
          status: "approved",
          role: "admin",
          joinedAt: serverTimestamp()
        }
      );

      await setDoc(
        doc(db, "userDashboards", currentUser.uid, "items", dashboardRef.id),
        {
          name,
          code,
          role: "Admin",
          joinedAt: serverTimestamp()
        }
      );

      await refreshDashboards();
      selectedDashboard = myDashboards.find(item => item.id === dashboardRef.id);
      showMessage("Dashboard created successfully!");
      setPage("details");
    } catch (error) {
      showMessage("Could not create dashboard: " + error.message);
    } finally {
      busy = false;
    }
  };
}

function renderJoin() {
  content.innerHTML = `
    <section class="sv-hero">
      <div class="sv-muted">JOIN A FRIEND'S SPACE</div>
      <h2>Got a dashboard code?</h2>
      <p>Enter the code shared by the dashboard admin. You will get access after approval.</p>
    </section>
    <section class="sv-card">
      <form id="sv-join-form" class="sv-form">
        <label for="sv-join-code"><strong>6-digit join code</strong></label>
        <input id="sv-join-code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="e.g. 444123" required>
        <button class="sv-btn primary" type="submit">Request access</button>
      </form>
      <p class="sv-small">A request does not grant access automatically. The admin must approve it.</p>
    </section>`;

  document.getElementById("sv-join-form").onsubmit = async event => {
    event.preventDefault();
    if (!requireLogin() || busy) return;
    busy = true;

    try {
      const form = new FormData(event.currentTarget);
      const code = String(form.get("code") || "").trim();
      if (!/^\d{6}$/.test(code)) throw new Error("Enter a valid 6-digit code.");

      const codeSnapshot = await getDoc(doc(db, "dashboardCodes", code));
      if (!codeSnapshot.exists()) throw new Error("Code not found. Check the code with the admin.");

      const { dashboardId, ownerUid, name } = codeSnapshot.data();
      if (ownerUid === currentUser.uid) {
        throw new Error("You are already the admin of this dashboard.");
      }

      const memberRef = doc(db, "dashboards", dashboardId, "members", currentUser.uid);
      const memberSnapshot = await getDoc(memberRef);
      if (memberSnapshot.exists() && memberSnapshot.data().status === "approved") {
        throw new Error("You already have access to this dashboard.");
      }

      const requestRef = doc(
        db, "dashboards", dashboardId, "joinRequests", currentUser.uid
      );

      await setDoc(requestRef, {
        requesterUid: currentUser.uid,
        email: currentUser.email || "",
        dashboardName: name || "Shared dashboard",
        status: "pending",
        createdAt: serverTimestamp()
      });

      showMessage("Access request sent. Wait for the admin to approve it.");
      setPage("home");
    } catch (error) {
      showMessage("Could not send request: " + error.message);
    } finally {
      busy = false;
    }
  };
}

async function renderDetails() {
  if (!selectedDashboard) {
    setPage("home");
    return;
  }

  const dashboard = selectedDashboard;
  const isAdmin = dashboard.ownerUid === currentUser.uid ||
                  dashboard.role === "Admin";

  content.innerHTML = `
    <section class="sv-hero">
      <button class="sv-btn" id="sv-back">← Back to Home</button>
      <div class="sv-muted" style="margin-top:18px">DASHBOARD</div>
      <h2>${safeText(dashboard.name || "Study dashboard")}</h2>
      <p>${isAdmin ? "You are the admin of this space." : "Shared with you."}</p>
      ${isAdmin && dashboard.code ? `<p>Share code: <span class="sv-code">${safeText(dashboard.code)}</span></p>` : ""}
    </section>

    <section class="sv-card">
      <h3>📚 Study files</h3>
      <p>Files shared here will appear in this section.</p>
      <p class="sv-small">Shared file upload needs cloud file storage. This setup currently stores dashboard information and access requests in Firestore, not file contents.</p>
    </section>

    ${isAdmin ? `
      <section class="sv-card" style="margin-top:16px">
        <h3>Admin panel</h3>
        <p>Review people who requested access.</p>
        <div id="sv-requests" class="sv-list">Loading requests…</div>
      </section>` : ""}
  `;

  document.getElementById("sv-back").onclick = () => setPage("home");

  if (isAdmin) {
    const requestsBox = document.getElementById("sv-requests");
    try {
      const requestsSnapshot = await getDocs(
        collection(db, "dashboards", dashboard.id, "joinRequests")
      );
      const requests = requestsSnapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => item.status === "pending");

      if (!requests.length) {
        requestsBox.innerHTML = `<div class="sv-muted">No pending requests.</div>`;
        return;
      }

      requestsBox.innerHTML = requests.map(item => `
        <div class="sv-card">
          <strong>${safeText(item.email || item.requesterUid)}</strong>
          <p class="sv-muted">Status: ${safeText(item.status)}</p>
          <div class="sv-row">
            <button class="sv-btn primary" data-approve="${safeText(item.id)}">Approve</button>
            <button class="sv-btn" data-reject="${safeText(item.id)}">Reject</button>
          </div>
        </div>
      `).join("");

      requestsBox.querySelectorAll("[data-approve]").forEach(button => {
        button.onclick = () => reviewRequest(dashboard, button.dataset.approve, "approved");
      });

      requestsBox.querySelectorAll("[data-reject]").forEach(button => {
        button.onclick = () => reviewRequest(dashboard, button.dataset.reject, "rejected");
      });
    } catch (error) {
      requestsBox.textContent = "Could not load requests: " + error.message;
    }
  }
}

async function reviewRequest(dashboard, uid, status) {
  if (!currentUser || dashboard.ownerUid !== currentUser.uid) {
    showMessage("Only the dashboard admin can review requests.");
    return;
  }

  try {
    const requestRef = doc(db, "dashboards", dashboard.id, "joinRequests", uid);
    const requestSnapshot = await getDoc(requestRef);
    if (!requestSnapshot.exists()) throw new Error("Request no longer exists.");

    if (status === "approved") {
      await setDoc(
        doc(db, "dashboards", dashboard.id, "members", uid),
        {
          uid,
          status: "approved",
          role: "member",
          joinedAt: serverTimestamp()
        }
      );

      await setDoc(
        doc(db, "userDashboards", uid, "items", dashboard.id),
        {
          name: dashboard.name,
          code: dashboard.code || "",
          role: "Member",
          joinedAt: serverTimestamp()
        }
      );
    }

    await updateDoc(requestRef, { status });
    showMessage(status === "approved" ? "Member approved." : "Request rejected.");
    await renderDetails();
  } catch (error) {
    showMessage("Could not update request: " + error.message);
  }
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  userLabel.textContent = user ? user.email : "Not signed in";
  logoutButton.hidden = !user;

  try {
    await refreshDashboards();
  } catch (error) {
    showMessage("Dashboard loading issue: " + error.message);
  }

  if (!user && activePage !== "account") activePage = "home";
  renderPage();
});
