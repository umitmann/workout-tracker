import { notFound } from 'next/navigation'
import { getAllExercises, getTemplate, getWorkoutWithSets } from '@/lib/dal'
import WorkoutLogger from './WorkoutLogger'

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workout = await getWorkoutWithSets(Number(id))

  if (!workout) notFound()

  const templateId = (workout as any).template_id
  const isInProgress = (workout as any).status !== 'completed'
  const [exercises, initialTemplate] = await Promise.all([
    getAllExercises(),
    isInProgress && workout.sets.length === 0 && templateId
      ? getTemplate(templateId)
      : Promise.resolve(null),
  ])

  return (
    <WorkoutLogger
      workout={workout as any}
      exercises={exercises as any}
      initialTemplate={initialTemplate}
    />
  )
}
