import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBmfC9YnDQ5J21q5p5FbZIKkEsWZGm81io",
  authDomain: "tez-yordam-3ac8d.firebaseapp.com",
  projectId: "tez-yordam-3ac8d",
  storageBucket: "tez-yordam-3ac8d.firebasestorage.app",
  messagingSenderId: "962831948651",
  appId: "1:962831948651:web:a04d09bfaaab1023658a2e",
  measurementId: "G-7QS0WPCGCY"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

export { app, auth, firebaseConfig };
