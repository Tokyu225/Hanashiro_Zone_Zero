// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  // Firebase web configuration. These values are public identifiers, not secrets;
  // access is controlled by Firebase Security Rules and authorized domains.
  firebase: {
    apiKey: 'AIzaSyChHk86chdDu3GiM2pbiCmztpWpvwXj54A',
    authDomain: 'fashioncentaremastered.firebaseapp.com',
    projectId: 'fashioncentaremastered',
    storageBucket: 'fashioncentaremastered.firebasestorage.app',
    messagingSenderId: '950159670602',
    appId: '1:950159670602:web:f0599799969a3e0a1055b3',
    databaseURL:
      'https://fashioncentaremastered-default-rtdb.asia-southeast1.firebasedatabase.app',
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
