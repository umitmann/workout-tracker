import type { AppNavigationItem } from '@/components/AppShell'

export function buildAppNavigation({
  traineeNotifications = 0,
  trainerNotifications = 0,
  showTrainerTools = false,
  isPlatformAdmin = false,
}: {
  traineeNotifications?: number
  trainerNotifications?: number
  showTrainerTools?: boolean
  isPlatformAdmin?: boolean
} = {}): AppNavigationItem[] {
  const items: AppNavigationItem[] = [
    { href: '/dashboard', label: 'Home', icon: 'home' },
    { href: '/workouts', label: 'Plans', icon: 'calendar' },
    { href: '/routines', label: 'Exercises', icon: 'library' },
    {
      href: '/connections',
      label: 'My PT',
      icon: 'coach',
      notificationCount: traineeNotifications,
    },
  ]

  if (showTrainerTools) {
    items.push({
      href: '/trainer/clients',
      label: 'Clients',
      icon: 'clients',
      notificationCount: trainerNotifications,
    })
  }

  items.push({
    href: '/trainers',
    label: 'Find a PT',
    icon: 'clients',
    mobile: !showTrainerTools,
  })

  if (isPlatformAdmin) {
    items.push({ href: '/admin/trainers', label: 'Admin', icon: 'admin', mobile: false })
  }

  return items
}
