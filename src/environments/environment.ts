// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  /**
   * CARTO basemaps key (https://carto.com/basemaps/apikey). CARTO serves "API KEY REQUIRED"
   * tiles without one. Leave empty to fall back to OpenStreetMap's standard tiles.
   */
  cartoApiKey: 'cb1_57l1_1_01ac8a1921d9ec192b798001',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
