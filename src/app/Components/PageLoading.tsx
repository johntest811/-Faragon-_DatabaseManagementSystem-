import LoadingCircle from "./LoadingCircle";

type PageLoadingProps = {
  label?: string;
  fullScreen?: boolean;
};

export default function PageLoading({
  label = "Loading page...",
  fullScreen = false,
}: PageLoadingProps) {
  const panel = (
    <section
      aria-busy="true"
      aria-live="polite"
      className="glass-panel animate-fade-in w-full rounded-3xl p-6"
      role="status"
    >
      <div className="flex min-h-48 items-center justify-center py-12">
        <LoadingCircle label={label} />
      </div>
    </section>
  );

  if (!fullScreen) return panel;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-lg">{panel}</div>
    </main>
  );
}
