const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../../packages/shared");

const config = getDefaultConfig(projectRoot);

// O pacote partilhado (marca, perfis, domínio) vive fora desta app e é compilado pelo Metro a partir do código TS.
config.watchFolders = [sharedRoot];
config.resolver.extraNodeModules = { "@uni/shared": sharedRoot };
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
