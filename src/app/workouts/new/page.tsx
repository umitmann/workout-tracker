import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getAllExercises } from '@/lib/dal'
import TemplateEditor from '../[id]/TemplateEditor'

export default async function NewTemplatePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const exercises = await getAllExercises()

  return <TemplateEditor exercises={exercises as any} />
}
