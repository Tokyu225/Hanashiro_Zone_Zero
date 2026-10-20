import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Database, getDatabase } from 'firebase/database';

import { environment } from '../environments/environment';

/**
 * Single Firebase app instance shared by the whole application.
 * Reusing an existing app avoids the "duplicate-app" error during hot reload.
 */
const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(environment.firebase);

export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firebaseDatabase: Database = getDatabase(firebaseApp);
