/**
 * AsyncStorage n'a pas de partie native sous jest : la bibliothèque fournit
 * son propre simulacre officiel (stockage en mémoire), branché ici. Sans lui,
 * tout module important AsyncStorage — dont stockage-local — fait échouer la
 * suite avec « NativeModule: AsyncStorage is null ».
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
