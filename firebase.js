
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Apne Firebase Console se values yahan paste karna.
const firebaseConfig = {
  apiKey: "AIzaSyDW595sDrRKk4n2Gk1F8xu4etfZmO5St-8",
  authDomain: "offline-study-vault.firebaseapp.com",
  projectId: "offline-study-vault",
  storageBucket: "offline-study-vault.firebasestorage.app",
  messagingSenderId: "134259394849",
  appId: "1:134259394849:web:88f52303a9f927d4c21660"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app,
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
};
