import { notFound } from 'next/navigation'
import { getTemplate, getWorkoutWithSets } from '@/lib/dal'
import { getWorkoutPlanAsRoutine } from '@/lib/trainerPlanningDal'
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
  const planId = (workout as any).plan_id
  const isInProgress = (workout as any).status !== 'completed'
  const initialTemplate = isInProgress && workout.sets.length === 0
    ? planId
      ? await getWorkoutPlanAsRoutine(planId)
      : templateId
        ? await getTemplate(templateId)
        : null
    : null

  return (
    <WorkoutLogger
      workout={workout as any}
      exercises={[]}
      initialTemplate={initialTemplate}
    />
  )
}
