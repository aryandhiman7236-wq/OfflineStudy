
import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp
} from "./firebase.js";

const style = document.createElement("style");
style.textContent = `
#sv-cloud {
  position:relative; z-index:10; margin:20px auto;
  max-width:900px; padding:20px; border:1px solid #e4e4ef;
  border-radius:16px; background:#fff; color:#202033;
  font:15px/1.5 Arial,sans-serif;
  box-shadow:0 5px 24px #20204012;
}
#sv-cloud input,#sv-cloud button {
  box-sizing:border-box; padding:11px; border-radius:9px;
  border:1px solid #d9d9e5; font:inherit; margin:4px 0;
}
#sv-cloud input { width:100%; }
#sv-cloud button { cursor:pointer; background:#5146d8; color:white; border:0; }
#sv-cloud .sv-card { border:1px solid #e7e7ef; padding:14px; border-radius:12px; margin:12px 0; }
#sv-cloud .sv-muted { color:#66677b; font-size:13px; }
#sv-cloud [hidden] { display:none!important; }
`;
document.head.appendChild(style);

const root = document.createElement("section");
root.id = "sv-cloud";
root.innerHTML = `
  <h2>Shared Study Dashboards</h2>
  <p class="sv-muted">Sign in to create a dashboard or request access to one.</p>

  <div id="sv-auth" class="sv-card">
    <h3>Login / Create account</h3>
    <input id="sv-email" type="email" placeholder="Email address" autocomplete="email">
    <input id="sv-password" type="password" placeholder="Password (6+ characters)" autocomplete="current-password">
    <button id="sv-login">Login</button>
    <button id="sv-signup">Create account</button>
  </div>

  <div id="sv-main" hidden>
    <p id="sv-user"></p>
    <button id="sv-logout">Logout</button>

    <div class="sv-card">
      <h3>Create a dashboard</h3>
      <input id="sv-name" placeholder="Dashboard name">
      <button id="sv-create">Create dashboard</button>
      <p id="sv-created"></p>
    </div>

    <div class="sv-card">
      <h3>Join a dashboard</h3>
      <input id="sv-code" inputmode="numeric" maxlength="12" placeholder="Enter code, e.g. 444">
      <button id="sv-join">Request access</button>
      <p id="sv-join-result"></p>
    </div>

    <div class="sv-card">
      <h3>Your dashboards</h3>
      <div id="sv-dashboards">Loading…</div>
    </div>

    <div class="sv-card">
      <h3>Pending join requests (admin)</h3>
      <div id="sv-requests">Choose a dashboard you own to review requests.</div>
    </div>
  </div>

  <p id="sv-message" role="status" aria-live="polite"></p>
`;

document.body.appendChild(root);

const $ = id => document.getElementById(id);
let selectedDashboard = null;

function message(text) {
  $("sv-message").textContent = text;
}

function escapeText(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function newCode() {
  // Simple numeric code, 3 digits.
  return String(Math.floor(100 + Math.random() * 900));
}

async function createDashboard() {
  const user = auth.currentUser;
  const name = $("sv-name").value.trim();
  if (!user) throw new Error("Please login first.");
  if (!name) throw new Error("Enter a dashboard name.");

  // Retry if a numeric code is already in use.
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = newCode();
    const codeRef = doc(db, "dashboardCodes", code);
    const existing = await getDoc(codeRef);
    if (existing.exists()) continue;

    const dashboardRef = doc(collection(db, "dashboards"));

    await setDoc(dashboardRef, {
      name,
      ownerUid: user.uid,
      createdAt: serverTimestamp()
    });

    try {
      await setDoc(codeRef, {
        dashboardId: dashboardRef.id,
        ownerUid: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      // Keep the dashboard; do not delete user data.
      throw new Error(
        "Dashboard created, but code setup failed. Check Firestore Rules. " +
        error.message
      );
    }

    $("sv-created").textContent =
      `Created: ${name} | Join code: ${code}`;

    selectedDashboard = dashboardRef.id;
    await loadDashboards();
    await loadRequests(dashboardRef.id);
    return;
  }

  throw new Error("Could not generate a free code. Try again.");
}

async function requestJoin() {
  const user = auth.currentUser;
  const code = $("sv-code").value.trim();

  if (!user) throw new Error("Please login first.");
  if (!/^\d{3}$/.test(code)) {
    throw new Error("Enter a 3-digit code, such as 444.");
  }

  const codeSnap = await getDoc(doc(db, "dashboardCodes", code));
  if (!codeSnap.exists()) throw new Error("Dashboard code not found.");

  const dashboardId = codeSnap.data().dashboardId;
  const dashboardSnap = await getDoc(doc(db, "dashboards", dashboardId));
  if (!dashboardSnap.exists()) throw new Error("Dashboard no longer exists.");

  if (dashboardSnap.data().ownerUid === user.uid) {
    throw new Error("You already own this dashboard.");
  }

  const requestRef = doc(
    db, "dashboards", dashboardId, "joinRequests", user.uid
  );
  const oldRequest = await getDoc(requestRef);

  if (oldRequest.exists() && oldRequest.data().status === "pending") {
    throw new Error("Your request is already pending.");
  }

  await setDoc(requestRef, {
    requesterUid: user.uid,
    status: "pending",
    createdAt: serverTimestamp()
  });

  $("sv-join-result").textContent =
    "Request sent. Wait for the dashboard admin to approve you.";
}

async function loadDashboards() {
  const user = auth.currentUser;
  if (!user) return;

  const output = $("sv-dashboards");
  output.textContent = "Loading…";

  try {
    const q = query(
      collection(db, "dashboards"),
      where("ownerUid", "==", user.uid)
    );
    const snap = await getDocs(q);

    output.innerHTML = "";
    if (snap.empty) {
      output.textContent = "You have not created a dashboard yet.";
      return;
    }

    snap.forEach(item => {
      const data = item.data();
      const card = document.createElement("div");
      card.className = "sv-card";
      card.innerHTML = `
        <strong>${escapeText(data.name)}</strong>
        <p class="sv-muted">You are the admin of this dashboard.</p>
        <button type="button">Review join requests</button>
      `;
      card.querySelector("button").addEventListener("click", async () => {
        selectedDashboard = item.id;
        await loadRequests(item.id);
      });
      output.appendChild(card);
    });
  } catch (error) {
    output.textContent = "Could not load dashboards: " + error.message;
  }
}

async function loadRequests(dashboardId) {
  const user = auth.currentUser;
  if (!user) return;

  const output = $("sv-requests");
  output.textContent = "Loading requests…";

  try {
    const dashboardSnap = await getDoc(doc(db, "dashboards", dashboardId));
    if (!dashboardSnap.exists() ||
        dashboardSnap.data().ownerUid !== user.uid) {
      output.textContent = "Only the dashboard admin can review requests.";
      return;
    }

    const snap = await getDocs(
      collection(db, "dashboards", dashboardId, "joinRequests")
    );

    output.innerHTML = "";
    const pending = snap.docs.filter(
      item => item.data().status === "pending"
    );

    if (!pending.length) {
      output.textContent = "No pending requests.";
      return;
    }

    for (const item of pending) {
      const card = document.createElement("div");
      card.className = "sv-card";
      card.innerHTML = `
        <p>Account ID: <code>${escapeText(item.id)}</code></p>
        <button type="button">Approve</button>
        <button type="button" style="background:#b42318">Reject</button>
      `;

      const [approve, reject] = card.querySelectorAll("button");

      approve.addEventListener("click", async () => {
        try {
          await setDoc(
            doc(db, "dashboards", dashboardId, "members", item.id),
            {
              uid: item.id,
              status: "approved",
              approvedAt: serverTimestamp()
            }
          );

          await setDoc(
            doc(db, "dashboards", dashboardId, "joinRequests", item.id),
            {
              requesterUid: item.id,
              status: "approved",
              reviewedAt: serverTimestamp()
            },
            { merge: true }
          );

          message("Member approved.");
          await loadRequests(dashboardId);
        } catch (error) {
          message("Approval failed: " + error.message);
        }
      });

      reject.addEventListener("click", async () => {
        try {
          await setDoc(
            doc(db, "dashboards", dashboardId, "joinRequests", item.id),
            {
              requesterUid: item.id,
              status: "rejected",
              reviewedAt: serverTimestamp()
            },
            { merge: true }
          );

          message("Request rejected.");
          await loadRequests(dashboardId);
        } catch (error) {
          message("Rejection failed: " + error.message);
        }
      });

      output.appendChild(card);
    }
  } catch (error) {
    output.textContent = "Could not load requests: " + error.message;
  }
}

$("sv-signup").addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(
      auth,
      $("sv-email").value.trim(),
      $("sv-password").value
    );
    message("Account created.");
  } catch (error) {
    message(error.message);
  }
});

$("sv-login").addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      $("sv-email").value.trim(),
      $("sv-password").value
    );
    message("Logged in.");
  } catch (error) {
    message(error.message);
  }
});

$("sv-logout").addEventListener("click", async () => {
  try {
    await signOut(auth);
    message("Logged out.");
  } catch (error) {
    message(error.message);
  }
});

$("sv-create").addEventListener("click", async () => {
  try {
    message("Creating dashboard…");
    await createDashboard();
    message("Dashboard created successfully.");
  } catch (error) {
    message(error.message);
  }
});

$("sv-join").addEventListener("click", async () => {
  try {
    message("Sending request…");
    await requestJoin();
  } catch (error) {
    message(error.message);
  }
});

auth.onAuthStateChanged(user => {
  $("sv-auth").hidden = !!user;
  $("sv-main").hidden = !user;

  if (user) {
    $("sv-user").textContent = "Signed in: " + user.email;
    loadDashboards();
  } else {
    $("sv-dashboards").textContent = "";
    $("sv-requests").textContent = "Please login first.";
    selectedDashboard = null;
  }
});
