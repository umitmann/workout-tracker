import Link from 'next/link'
import AccountMenu from './AccountMenu'

export type AppNavigationItem = {
  href: string
  label: string
  icon: 'home' | 'calendar' | 'library' | 'coach' | 'clients' | 'admin'
  notificationCount?: number
  mobile?: boolean
}

function Icon({ name }: { name: AppNavigationItem['icon'] }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'home') {
    return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>
  }
  if (name === 'calendar') {
    return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
  }
  if (name === 'library') {
    return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v19H6.5A2.5 2.5 0 0 1 4 18.5v-14A2.5 2.5 0 0 1 6.5 2Z"/><path d="M9 7h7M9 11h5"/></svg>
  }
  if (name === 'coach') {
    return <svg {...common}><path d="M8 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="14" cy="7" r="4"/><path d="M4 4v6M1 7h6"/></svg>
  }
  if (name === 'clients') {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  }
  return <svg {...common}><path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z"/><path d="M5.5 9v6.5L12 19l6.5-3.5V9"/><path d="M20.5 7.5V14"/></svg>
}

function NavigationLink({
  item,
  currentPath,
  mobile = false,
}: {
  item: AppNavigationItem
  currentPath: string
  mobile?: boolean
}) {
  const current = item.href === '/dashboard'
    ? currentPath === item.href
    : currentPath === item.href || currentPath.startsWith(`${item.href}/`)
  const count = Number.isInteger(item.notificationCount) && (item.notificationCount ?? 0) > 0
    ? item.notificationCount ?? 0
    : 0
  const accessibleLabel = count > 0 ? `${item.label} (${count})` : item.label

  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      aria-label={accessibleLabel}
      className={mobile
        ? `relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[0.68rem] font-semibold transition-colors ${
            current
              ? 'text-orange-600 dark:text-orange-400'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
          }`
        : `relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
            current
              ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
              : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white'
          }`
      }
    >
      <span className="relative shrink-0">
        <Icon name={item.icon} />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-3 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[0.6rem] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-950"
          >
            {count}
          </span>
        )}
      </span>
      <span className={mobile ? 'max-w-full truncate' : ''}>{item.label}</span>
    </Link>
  )
}

export default function AppShell({
  title,
  eyebrow,
  currentPath,
  navigation,
  userName,
  avatarUrl,
  actions,
  children,
  maxWidth = 'max-w-5xl',
}: {
  title: string
  eyebrow?: string
  currentPath: string
  navigation: AppNavigationItem[]
  userName?: string | null
  avatarUrl?: string | null
  actions?: React.ReactNode
  children: React.ReactNode
  maxWidth?: string
}) {
  const mobileNavigation = navigation.filter((item) => item.mobile !== false).slice(0, 5)

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] dark:bg-[var(--color-canvas)] dark:text-[var(--color-ink)]">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 dark:bg-white dark:text-zinc-950"
      >
        Skip to content
      </a>

      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-zinc-200/80 bg-white/75 px-4 py-5 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/75 md:flex md:flex-col">
          <Link href="/dashboard" className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-zinc-950 dark:text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-600 font-black text-white shadow-sm shadow-orange-900/20">W</span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight">Workout</span>
              <span className="block text-xs font-medium text-zinc-500">train with intent</span>
            </span>
          </Link>

          <nav aria-label="Primary navigation" className="mt-8 flex flex-col gap-1">
            {navigation.map((item) => (
              <NavigationLink key={item.href} item={item} currentPath={currentPath} />
            ))}
          </nav>

          <div className="mt-auto border-t border-zinc-200 pt-4 dark:border-zinc-800">
            {userName && (
              <Link href="/account" className="flex min-h-11 items-center gap-3 rounded-xl px-2 transition hover:bg-zinc-100 dark:hover:bg-zinc-900">
                {avatarUrl ? (
                  // Auth-provider avatars may be remote and are not part of the app image pipeline.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    {userName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">{userName}</span>
              </Link>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-[color:var(--color-canvas)]/90 px-5 py-3 backdrop-blur-xl dark:border-zinc-800 sm:px-7 md:static md:bg-transparent md:py-7 md:backdrop-blur-none">
            <div className={`mx-auto flex ${maxWidth} items-center justify-between gap-4`}>
              <div className="min-w-0">
                {eyebrow && <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">{eyebrow}</p>}
                <h1 className="truncate text-xl font-black tracking-tight text-zinc-950 dark:text-white md:text-2xl">{title}</h1>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {actions}
                <AccountMenu userName={userName} avatarUrl={avatarUrl} />
              </div>
            </div>
          </header>

          <main id="main-content" tabIndex={-1} className={`mx-auto ${maxWidth} px-5 py-6 outline-none sm:px-7 md:pb-12 md:pt-2`}>
            {children}
          </main>
        </div>
      </div>

      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-zinc-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(24,24,27,0.06)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden"
      >
        {mobileNavigation.map((item) => (
          <NavigationLink key={item.href} item={item} currentPath={currentPath} mobile />
        ))}
      </nav>
    </div>
  )
}
