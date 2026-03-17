export function Layout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-surface text-slate-900">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 left-[-120px] h-72 w-72 rounded-full bg-brand-100 blur-3xl" />
        <div className="absolute bottom-0 right-[-120px] h-72 w-72 rounded-full bg-orange-200 blur-3xl" />
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 animate-rise rounded-3xl border border-white/70 bg-white/80 p-6 shadow-soft backdrop-blur">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-brand-900 sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl font-body text-sm text-slate-600 sm:text-base">{subtitle}</p>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, className = '', ...props }) {
  return (
    <section className={`rounded-2xl border border-white/70 bg-white p-5 shadow-soft ${className}`} {...props}>
      {children}
    </section>
  );
}
