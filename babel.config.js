/**
 * Configuration Babel — nécessaire uniquement pour les TESTS.
 *
 * Metro (build de l'app) utilise sa propre configuration par défaut ; ce
 * fichier reprend le même préréglage Expo pour ne rien changer au bundle, et
 * ajoute, sous l'environnement de test SEULEMENT, la transformation des
 * imports dynamiques en `require`. Sans elle, Jest refuse un
 * `await import(...)` — or la carte charge Leaflet exactement comme ça, et
 * c'est précisément ce comportement qu'on veut tester.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      test: { plugins: ['dynamic-import-node'] },
    },
  };
};
