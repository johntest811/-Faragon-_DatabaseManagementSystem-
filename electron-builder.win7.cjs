/* eslint-disable @typescript-eslint/no-require-imports */
const packageJson = require("./package.json");

const modernBuild = packageJson.build;

console.warn(
  "LEGACY BUILD: Electron 22 is end-of-life. Windows 7 compatibility is not verified " +
  "and Tailwind v4 targets browsers newer than this runtime. Do not treat this as a supported production build."
);

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
