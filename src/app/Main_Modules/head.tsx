export default function Head() {
  // Static export + Electron: meta refresh ensures redirect works even if JS fails to hydrate.
  return (
    <>
      <meta httpEquiv="refresh" content="0; url=/Main_Modules/Dashboard/" />
    </>
  );
}
