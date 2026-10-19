import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, DatabaseReference } from 'firebase/database';

export const firebaseConfig = {
  apiKey: "AIzaSyDibpkuzUookkbMVIoHqe_rYu1umY1qF-4",
  authDomain: "data-b93ed.firebaseapp.com",
  databaseURL: "https://data-b93ed-default-rtdb.firebaseio.com",
  projectId: "data-b93ed",
  storageBucket: "data-b93ed.appspot.com",
  messagingSenderId: "218236841715",
  appId: "1:218236841715:web:e96bfd3174b08438701186"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, onValue };
export type { DatabaseReference };
