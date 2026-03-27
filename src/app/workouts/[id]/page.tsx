import { notFound, redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getAllExercises, getTemplate } from '@/lib/dal'
import TemplateEditor from './TemplateEditor'

export default async function EditTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string; workoutId?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ id }, { date, workoutId }] = await Promise.all([params, searchParams])
  const [template, exercises] = await Promise.all([
    getTemplate(id),
    getAllExercises(),
  ])

  if (!template) notFound()

  return (
    <TemplateEditor
      exercises={exercises as any}
      template={template}
      date={date}
      workoutId={workoutId ? Number(workoutId) : undefined}
    />
  )
}
