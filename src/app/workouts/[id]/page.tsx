import { notFound, redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getAllExercises, getTemplate } from '@/lib/dal'
import TemplateEditor from './TemplateEditor'

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { id } = await params
  const [template, exercises] = await Promise.all([
    getTemplate(Number(id)),
    getAllExercises(),
  ])

  if (!template) notFound()

  return <TemplateEditor exercises={exercises as any} template={template} />
}
