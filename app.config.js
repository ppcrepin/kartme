// Config Expo dynamique : reprend app.json et injecte la baseUrl web
// uniquement quand EXPO_BASE_URL est fourni (déploiement GitHub Pages sous
// /kartme). En local (dev, e2e, export sans variable), rien ne change.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (baseUrl) {
    config.experiments = { ...config.experiments, baseUrl };
  }
  return config;
};
