import { notFound, redirect } from 'next/navigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getAllExercises, getTemplate } from '@/lib/dal'
import { isWorkoutLabPreviewEnabled } from '@/lib/workoutLabPreview'
import TemplateEditor from './TemplateEditor'

export default async function EditTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string; workoutId?: string; preview?: string | string[] }>
}) {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const [{ id }, { date, workoutId, preview }] = await Promise.all([params, searchParams])
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
      workoutLabPreview={isWorkoutLabPreviewEnabled(preview)}
    />
  )
}
