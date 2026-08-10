/* eslint-disable @typescript-eslint/no-require-imports */
const packageJson = require("./package.json");

const modernBuild = packageJson.build;

module.exports = {
  ...modernBuild,
  electronVersion: "22.3.27",
  publish: null,
  directories: {
    ...modernBuild.directories,
    output: "dist-win7",
  },
  win: {
    ...modernBuild.win,
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    artifactName: "Faragon.Database.Win7.Legacy.Setup.${version}.${ext}",
  },
};
