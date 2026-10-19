import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, DatabaseReference } from 'firebase/database';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBPqwi4EA0Ta746PiNfkmdHaJFikwFJJFA",
  authDomain: "rfidproject-e2225.firebaseapp.com",
  databaseURL: "https://rfidproject-e2225-default-rtdb.firebaseio.com",
  projectId: "rfidproject-e2225",
  storageBucket: "rfidproject-e2225.firebasestorage.app",
  messagingSenderId: "880640517617",
  appId: "1:880640517617:web:bb11c0c44aec8cb968d050"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, onValue };
export type { DatabaseReference };
