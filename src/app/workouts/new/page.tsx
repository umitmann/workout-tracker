import { redirect } from 'next/navigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getAllExercises } from '@/lib/dal'
import { isWorkoutLabPreviewEnabled } from '@/lib/workoutLabPreview'
import TemplateEditor from '../[id]/TemplateEditor'

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string | string[] }>
}) {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const [exercises, { preview }] = await Promise.all([getAllExercises(), searchParams])

  return (
    <TemplateEditor
      exercises={exercises as any}
      workoutLabPreview={isWorkoutLabPreviewEnabled(preview)}
    />
  )
}
