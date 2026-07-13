import 'server-only'

import { requireQueryData } from './dataAccessError'
import { getServerAuthContext } from './serverAuth'
import type {
  AdminTrainerProfile,
  OwnTrainerProfile,
  TrainerDirectoryInput,
  TrainerDirectoryListing,
  TrainerVerificationStatus,
} from './trainerTypes'

async function getAuthenticatedClient() {
  const context = await getServerAuthContext()
  if (!context.user) throw new Error('Authentication required')
  return context.supabase
}

export async function getOwnTrainerProfile(): Promise<OwnTrainerProfile | null> {
  const supabase = await getAuthenticatedClient()
  const result = await supabase
    .from('trainer_profiles')
    .select(
      'id, display_name, avatar_url, bio, specialties, remote_available, location_text, accepting_clients, listing_status, verification_status, reviewed_at, created_at, updated_at',
    )
    .maybeSingle()

  return requireQueryData(result, 'load own trainer profile') as OwnTrainerProfile | null
}

export async function searchTrainerDirectory(
  input: TrainerDirectoryInput,
): Promise<TrainerDirectoryListing[]> {
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('trainer_directory_search', {
    p_query: input.query,
    p_specialty: input.specialty,
    p_remote: input.remote,
    p_limit: input.pageSize,
    p_offset: input.offset,
  })

  return (requireQueryData(result, 'search trainer directory') ?? []) as TrainerDirectoryListing[]
}

export async function getDirectoryTrainer(
  profileId: string,
): Promise<TrainerDirectoryListing | null> {
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('trainer_directory_get', {
    p_profile_id: profileId,
  })
  const rows = (requireQueryData(result, 'load trainer directory profile') ?? []) as TrainerDirectoryListing[]
  return rows[0] ?? null
}

export async function currentUserIsPlatformAdmin(): Promise<boolean> {
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('current_user_is_platform_admin')
  return requireQueryData(result, 'check platform administrator role') === true
}

export async function listTrainerProfilesForAdmin(
  status: TrainerVerificationStatus | null,
): Promise<AdminTrainerProfile[]> {
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('admin_list_trainer_profiles', {
    p_verification_status: status,
    p_limit: 100,
    p_offset: 0,
  })

  return (requireQueryData(result, 'list trainer applications') ?? []) as AdminTrainerProfile[]
}
