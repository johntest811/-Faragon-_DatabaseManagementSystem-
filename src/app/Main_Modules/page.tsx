export default function RootPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1C1C]"></div>
        <p className="mt-4 text-gray-600">Redirecting to the dashboard...</p>
        <p className="mt-2 text-sm text-gray-500">
          If this doesn’t redirect, open{' '}
          <a className="text-blue-600 underline" href="/Main_Modules/Dashboard/">
            Dashboard
          </a>
          .
        </p>
      </div>
    </div>
  );
}